#!/usr/bin/env node

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const root = process.cwd();
const args = new Set(process.argv.slice(2));
const liveMode = args.has("--live");
const outputFlagIndex = process.argv.indexOf("--json-output");
const outputPath = outputFlagIndex >= 0 ? process.argv[outputFlagIndex + 1] : null;

if (outputFlagIndex >= 0 && !outputPath) {
  throw new Error("--json-output requires a path");
}

const config = JSON.parse(await readFile(path.join(root, "docs.json"), "utf8"));
const baseline = JSON.parse(
  await readFile(path.join(root, "facts", "aeo-baseline.json"), "utf8"),
);
const crawlerUserAgents = [
  "Googlebot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "PerplexityBot",
  "Claude-SearchBot",
];

const results = [];

function record(status, name, details) {
  results.push({ status, name, details });
}

function pass(name, details) {
  record("pass", name, details);
}

function warn(name, details) {
  record("warn", name, details);
}

function fail(name, details) {
  record("fail", name, details);
}

async function listFiles(directory, extension) {
  const found = [];

  async function walk(current) {
    const entries = await readdir(current, { withFileTypes: true });
    for (const entry of entries) {
      if ([".git", ".mintlify", "node_modules"].includes(entry.name)) continue;
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile() && absolute.endsWith(extension)) found.push(absolute);
    }
  }

  await walk(directory);
  return found.sort();
}

async function previousProtectedRouteInventory() {
  const candidates = [];
  if (process.env.GITHUB_EVENT_NAME === "push") candidates.push("HEAD^");
  if (process.env.GITHUB_BASE_REF) candidates.push(`origin/${process.env.GITHUB_BASE_REF}`);
  candidates.push("origin/main");

  for (const reference of [...new Set(candidates)]) {
    try {
      const { stdout } = await execFileAsync(
        "git",
        ["show", `${reference}:facts/aeo-baseline.json`],
        { cwd: root, maxBuffer: 2_000_000 },
      );
      const previous = JSON.parse(stdout);
      if (Array.isArray(previous.protectedRoutes)) return { reference, routes: previous.protectedRoutes };
    } catch {
      // The baseline did not exist before the first AEO audit change, or the ref is unavailable locally.
    }
  }
  return null;
}

function navigationPages(navigation) {
  const pages = [];

  function visit(value, pageContext = false) {
    if (typeof value === "string" && pageContext) {
      pages.push(value.replace(/^\//, "").replace(/\.mdx$/, ""));
      return;
    }
    if (Array.isArray(value)) {
      for (const entry of value) visit(entry, pageContext);
      return;
    }
    if (!value || typeof value !== "object") return;
    for (const [key, child] of Object.entries(value)) {
      visit(child, pageContext || key === "pages");
    }
  }

  visit(navigation);
  return pages;
}

function parseFrontmatter(source) {
  const match = source.match(/^---\s*\n([\s\S]*?)\n---\s*(?:\n|$)/);
  if (!match) return null;

  const data = {};
  const lines = match[1].split("\n");
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const field = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!field) continue;

    let value = field[2].trim();
    if (/^[>|][+-]?$/.test(value)) {
      const folded = value.startsWith(">");
      const continuation = [];
      while (index + 1 < lines.length && /^(?:\s+|$)/.test(lines[index + 1])) {
        index += 1;
        continuation.push(lines[index].replace(/^\s+/, ""));
      }
      value = continuation.join(folded ? " " : "\n").trim();
    } else {
      let quote = null;
      for (let character = 0; character < value.length; character += 1) {
        if ((value[character] === '"' || value[character] === "'") && value[character - 1] !== "\\") {
          if (!quote) quote = value[character];
          else if (quote === value[character]) quote = null;
        }
        if (value[character] === "#" && !quote && (character === 0 || /\s/.test(value[character - 1]))) {
          value = value.slice(0, character).trimEnd();
          break;
        }
      }
    }
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    } else if (/^(?:true|false)$/i.test(value)) {
      value = value.toLowerCase() === "true";
    } else if (/^(?:null|~)$/i.test(value)) {
      value = null;
    }
    data[field[1]] = value;
  }

  return { data, body: source.slice(match[0].length) };
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function tagAttribute(tag, attribute) {
  const expression = new RegExp(`${attribute}\\s*=\\s*["']([^"']+)["']`, "i");
  return tag.match(expression)?.[1] ?? null;
}

function canonicalFromHtml(html) {
  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = tagAttribute(tag, "rel");
    if (rel?.toLowerCase().split(/\s+/).includes("canonical")) {
      return tagAttribute(tag, "href");
    }
  }
  return null;
}

function metaRobotsFromHtml(html, userAgent = null) {
  const relevantNames = new Set(["robots"]);
  if (userAgent) relevantNames.add(userAgent.toLowerCase().split(/[\s/]/, 1)[0]);
  return (html.match(/<meta\b[^>]*>/gi) ?? [])
    .filter((tag) => relevantNames.has(tagAttribute(tag, "name")?.toLowerCase()))
    .flatMap((tag) => (tagAttribute(tag, "content") ?? "").toLowerCase().split(/[\s,]+/))
    .filter(Boolean);
}

function jsonLdTypesFromHtml(html) {
  const types = new Set();
  const nodes = [];
  let invalidScripts = 0;

  function collect(value) {
    if (Array.isArray(value)) {
      for (const entry of value) collect(entry);
      return;
    }
    if (!value || typeof value !== "object") return;
    nodes.push(value);
    const type = value["@type"];
    for (const entry of Array.isArray(type) ? type : [type]) {
      if (typeof entry === "string") types.add(entry);
    }
    for (const child of Object.values(value)) collect(child);
  }

  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const tag = `<script${match[1]}>`;
    if (tagAttribute(tag, "type")?.toLowerCase() !== "application/ld+json") continue;
    try {
      collect(JSON.parse(match[2]));
    } catch {
      invalidScripts += 1;
    }
  }
  return { types, nodes, invalidScripts };
}

function schemaNodeHasType(node, expectedType) {
  const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
  return types.includes(expectedType);
}

function schemaReferenceHasId(value, expectedId) {
  if (Array.isArray(value)) return value.some((entry) => schemaReferenceHasId(entry, expectedId));
  if (typeof value === "string") return value === expectedId;
  return value?.["@id"] === expectedId;
}

function structuredDataIdentityProblems(jsonLd, organization) {
  const problems = [];
  const organizationNode = jsonLd.nodes.find(
    (node) => schemaNodeHasType(node, "Organization") && node["@id"] === organization.id,
  );
  if (!organizationNode) {
    problems.push(`Organization ${organization.id} is missing`);
  } else {
    for (const field of ["name", "legalName", "url"]) {
      if (organizationNode[field] !== organization[field]) {
        problems.push(`Organization ${field} is ${organizationNode[field] ?? "missing"}`);
      }
    }
    const actualProfiles = Array.isArray(organizationNode.sameAs)
      ? organizationNode.sameAs
      : organizationNode.sameAs ? [organizationNode.sameAs] : [];
    if (JSON.stringify([...actualProfiles].sort()) !== JSON.stringify([...organization.sameAs].sort())) {
      problems.push("Organization sameAs profiles do not match the approved identity");
    }
  }

  const articles = jsonLd.nodes.filter(
    (node) => schemaNodeHasType(node, "Article") || schemaNodeHasType(node, "TechArticle"),
  );
  for (const article of articles) {
    if (!schemaReferenceHasId(article.publisher, organization.id)) {
      problems.push(`${article["@id"] ?? article.headline ?? "Article"} does not reference the approved publisher`);
    }
  }
  return problems;
}

function decodeXml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'");
}

async function fetchText(url, options = {}) {
  const response = await fetch(url, {
    redirect: options.redirect ?? "follow",
    signal: AbortSignal.timeout(options.timeout ?? 8_000),
    headers: {
      "cache-control": "no-cache",
      "user-agent": "Looksy-AEO-Audit/1.0",
      ...options.headers,
    },
  });
  const body = await response.text();
  return { response, body };
}

async function mapLimit(items, limit, worker) {
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  });
  await Promise.all(workers);
}

function machineResourceProblems(name, response, body) {
  const problems = [];
  if (!response.ok) problems.push(`HTTP ${response.status}`);
  if (body.length < 20) problems.push(`${body.length} bytes`);
  if (/\.json$/i.test(name)) {
    try {
      JSON.parse(body);
    } catch {
      problems.push("response is not valid JSON");
    }
  } else if (name === "sitemap.xml" && !/<(?:urlset|sitemapindex)\b/i.test(body)) {
    problems.push("response is not a sitemap document");
  } else if (name === "robots.txt" && !/^user-agent\s*:/im.test(body)) {
    problems.push("response is not a robots policy");
  } else if (/^(?:llms(?:-full)?\.txt|skill\.md)$/i.test(name) && !/^#\s+\S/m.test(body)) {
    problems.push("response is not a Markdown answer resource");
  }
  if (/<!doctype html|<html\b/i.test(body) && !/\.html?$/i.test(name)) {
    problems.push("response is an HTML fallback");
  }
  return problems;
}

function unexpectedOpenApiProblem(url, status, body) {
  const retired = status === 404 || status === 410;
  const servesSample = /OpenAPI Plant Store/i.test(body);
  if (retired && !servesSample) return null;

  const reason = servesSample
    ? "sample OpenAPI Plant Store is served"
    : "unconfigured OpenAPI route is still served";
  return `${url}: ${reason} with HTTP ${status}`;
}

function expectedPlanRow(plan) {
  return `| ${plan.name} | ${plan.monthlyPrice} | ${plan.monthlyCredits} | ${plan.additionalCreditPrice ?? "Not listed"} | ${plan.annualPrice ?? "Not listed"} |`;
}

function expectedLiveUrl(route) {
  if (route === "index") return baseline.site.docsBase;
  return `${baseline.site.docsBase}/${route}`;
}

function extractLinkTargets(source) {
  return [
    ...[...source.matchAll(/\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g)].map((match) => match[1]),
    ...[...source.matchAll(/\bhref=["']([^"']+)["']/g)].map((match) => match[1]),
  ];
}

function hasCanonicalDocsLink(source) {
  const homepage = new URL(baseline.site.homepage);
  return extractLinkTargets(source).some((target) => {
    try {
      const url = new URL(target, `${baseline.site.homepage}/llms.txt`);
      return url.origin === homepage.origin && (url.pathname === "/docs" || url.pathname.startsWith("/docs/"));
    } catch {
      return false;
    }
  });
}

function llmsFullCoverageProblems(source, pages) {
  const problems = [];
  const expectedSources = new Set(
    pages.map((page) => expectedLiveUrl(page.relative.replace(/\.mdx$/, ""))),
  );
  const entries = [...source.matchAll(/^# ([^\n]+)\nSource:\s+(\S+)\s*$/gm)]
    .map((match) => {
      const source = match[2].replace(/\/$/, "");
      return {
        index: match.index,
        end: match.index + match[0].length,
        title: match[1].trim(),
        source: source === `${baseline.site.docsBase}/index` ? baseline.site.docsBase : source,
      };
    });
  const publishedSources = entries.map((entry) => entry.source);
  const sourceCounts = new Map();
  for (const publishedSource of publishedSources) {
    sourceCounts.set(publishedSource, (sourceCounts.get(publishedSource) ?? 0) + 1);
  }
  for (const [publishedSource, count] of sourceCounts) {
    if (count > 1) problems.push(`${publishedSource}: duplicate source marker`);
  }
  for (const page of pages) {
    const route = page.relative.replace(/\.mdx$/, "");
    const expectedSource = expectedLiveUrl(route);
    const matches = entries.filter((entry) => entry.source === expectedSource);
    if (matches.length === 0) problems.push(`${route}: source marker missing`);
    if (matches.length > 1) problems.push(`${route}: source marker appears ${matches.length} times`);
    if (matches.length === 1) {
      if (typeof page.data?.title === "string" && matches[0].title !== page.data.title.trim()) {
        problems.push(`${route}: published corpus title does not match source`);
      }
    }
    if (matches.length === 1 && typeof page.body === "string") {
      const entryIndex = entries.indexOf(matches[0]);
      const sectionEnd = entries[entryIndex + 1]?.index ?? source.length;
      const publishedBody = normalizedMarkdownBody(source.slice(matches[0].end, sectionEnd), {
        collapseImageFrameShape: "generated",
      });
      const expectedBody = normalizedMarkdownBody(
        typeof page.data?.description === "string"
          ? `${page.data.description}\n\n${page.body}`
          : page.body,
        { collapseImageFrameShape: "source" },
      );
      if (publishedBody !== expectedBody) {
        problems.push(`${route}: published corpus body does not match source`);
      }
    }
  }
  for (const publishedSource of new Set(publishedSources)) {
    if (!expectedSources.has(publishedSource)) problems.push(`${publishedSource}: unexpected source marker`);
  }
  return problems;
}

function normalizedMarkdownBody(source, { collapseImageFrameShape } = {}) {
  const normalized = [];
  let inFence = false;
  const inlineCodeState = { delimiterLength: 0 };
  const lines = source.replaceAll("\r\n", "\n").split("\n");
  for (const [index, rawLine] of lines.entries()) {
    if (!inlineCodeState.delimiterLength && /^\s*```/.test(rawLine)) {
      inFence = !inFence;
      normalized.push(rawLine.trim().replace(/\s+theme=\{null\}$/, ""));
      continue;
    }
    if (
      collapseImageFrameShape && !inFence && !inlineCodeState.delimiterLength &&
      (
        (
          collapseImageFrameShape === "source" &&
          /^\s*<Frame\b[^>]*\bcaption="[^"]+"[^>]*>\s*$/.test(rawLine) &&
          /^\s*<img\b[^>]*\bsrc="\/images\/[^"]+"[^>]*\balt="[^"]+"[^>]*\/>\s*$/.test(lines[index + 1] ?? "")
        ) || (
          collapseImageFrameShape === "generated" &&
          /^\s*<Frame>\s*$/.test(rawLine) &&
          /^\s*<img\s+alt="[^"]+"\s*\/>\s*$/.test(lines[index + 1] ?? "")
        )
      ) &&
      /^\s*<\/Frame>\s*$/.test(lines[index + 2] ?? "")
    ) {
      const alt = lines[index + 1].match(/\balt="([^"]+)"/)?.[1];
      normalized.push(`<Image alt="${alt}">`);
      lines[index + 1] = "";
      lines[index + 2] = "";
      continue;
    }
    if (inFence) {
      normalized.push(rawLine.trimEnd());
      continue;
    }
    let line = rawLine
      .trim()
      .replace(/^\*\s+/, "- ")
      .replace(/^<CardGroup\s+cols=\{\d+\}>$/, "<CardGroup>");
    if (!inlineCodeState.delimiterLength) line = normalizeMintlifyGeneratedImage(line);
    line = normalizeGeneratedCurrencyEscapes(line, inlineCodeState);
    if (/^\|.*\|$/.test(line)) {
      const cells = line.slice(1, -1).split("|").map((cell) => cell.trim());
      const separator = cells.every((cell) => /^:?-{3,}:?$/.test(cell));
      line = `|${cells.map((cell) => {
        if (!separator) return cell;
        return `${cell.startsWith(":") ? ":" : ""}---${cell.endsWith(":") ? ":" : ""}`;
      }).join("|")}|`;
    }
    if (!line) {
      const nextLine = lines.slice(index + 1).find((candidate) => candidate.trim())?.trim();
      const betweenGeneratedCards = /<\/Card>$/.test(normalized.at(-1) ?? "") && /^<Card\b/.test(nextLine ?? "");
      if (!betweenGeneratedCards && normalized.length && normalized.at(-1) !== "") normalized.push("");
      continue;
    }
    normalized.push(line);
  }
  return normalized.join("\n").trim();
}

function normalizeMintlifyGeneratedImage(line) {
  const match = line.match(
    /^<img src="https:\/\/mintcdn\.com\/looksy\/[A-Za-z0-9_-]+\/(images\/[^?"\s]+)\?[^"]*" alt="([^"]+)" width="\d+" height="\d+" data-path="\1" \/>$/,
  );
  if (!match) return line;
  if (/%(?:2f|5c)/i.test(match[1])) return line;
  return `<img src="/${match[1]}" alt="${match[2]}" />`;
}

function normalizeGeneratedCurrencyEscapes(line, state) {
  let normalized = "";
  for (let index = 0; index < line.length;) {
    if (line[index] === "`") {
      let precedingBackslashes = 0;
      for (let cursor = index - 1; cursor >= 0 && line[cursor] === "\\"; cursor -= 1) precedingBackslashes += 1;
      const escapedOutsideCode = !state.delimiterLength && precedingBackslashes % 2 === 1;
      if (escapedOutsideCode) {
        normalized += "`";
        index += 1;
        continue;
      }
      let end = index + 1;
      while (line[end] === "`") end += 1;
      const delimiterLength = end - index;
      if (!state.delimiterLength) state.delimiterLength = delimiterLength;
      else if (delimiterLength === state.delimiterLength) state.delimiterLength = 0;
      normalized += line.slice(index, end);
      index = end;
      continue;
    }
    if (!state.delimiterLength && line[index] === "\\" && line[index + 1] === "$" && /\d/.test(line[index + 2] ?? "")) {
      normalized += "$";
      index += 2;
      continue;
    }
    normalized += line[index];
    index += 1;
  }
  return normalized;
}

function liveMarkdownBody(source, page) {
  const withoutIndex = source.replace(
    /^> ## Documentation Index\n> Fetch[^\n]*\n> Use[^\n]*\n+/,
    "",
  );
  return withoutIndex.replace(
    new RegExp(`^# ${escapeRegExp(page.data.title)}\\n\\n> ${escapeRegExp(page.data.description)}\\n+`),
    "",
  );
}

function visibleTextFromHtml(html) {
  return decodeXml(html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " "))
    .replace(/&#(?:xA0|160);/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function commercialPlanProblems(html, { requireAnnual }) {
  const text = visibleTextFromHtml(html);
  const problems = [];
  const monthlyCadenceSource = String.raw`(?:/|per)\s*(?:month|mo)\b`;
  const perAdditionalTryOnSource = String.raw`\s*per\s*(?:extra|additional)\s*try[- ]on`;
  const planOccurrences = baseline.plans.map((plan) => {
    const occurrences = [];
    let cursor = 0;
    while (cursor < text.length) {
      const occurrence = text.indexOf(plan.name, cursor);
      if (occurrence < 0) break;
      occurrences.push(occurrence);
      cursor = occurrence + plan.name.length;
    }
    return occurrences;
  });
  const candidates = [];
  const collectCandidates = (planIndex, positions) => {
    if (planIndex === planOccurrences.length) {
      let score = 0;
      for (let index = 0; index < baseline.plans.length; index += 1) {
        const plan = baseline.plans[index];
        const start = positions[index];
        const end = positions[index + 1] ?? start + 500;
        const segment = text.slice(start, end);
        if (
          index === 0
            ? /\bFree\b/i.test(segment)
            : new RegExp(`\\$(?:\\d+(?:\\.\\d+)?)\\s*${monthlyCadenceSource}`, "i").test(segment)
        ) {
          score += 1;
        }
        if (/\b[\d,]+\s+try-on(?:s)?\s+credits?\b/i.test(segment)) score += 1;
        if (
          plan.additionalCreditPrice
          && new RegExp(
            `(?:Additional credits at \\$(?:\\d+(?:\\.\\d+)?)|\\$(?:\\d+(?:\\.\\d+)?)${perAdditionalTryOnSource})`,
            "i",
          ).test(segment)
        ) {
          score += 1;
        }
      }
      candidates.push({
        positions,
        score,
        span: positions.at(-1) - positions[0],
      });
      return;
    }
    const previous = positions.at(-1) ?? -1;
    for (const occurrence of planOccurrences[planIndex]) {
      if (occurrence <= previous) continue;
      collectCandidates(planIndex + 1, [...positions, occurrence]);
    }
  };
  collectCandidates(0, []);
  if (!candidates.length) {
    return ["pricing section does not contain the complete Preview, Starter, Growth, and Scale sequence"];
  }
  candidates.sort((left, right) => right.score - left.score || left.span - right.span);
  const planStarts = candidates[0].positions;

  for (let index = 0; index < baseline.plans.length; index += 1) {
    const plan = baseline.plans[index];
    const start = planStarts[index];
    const end = planStarts[index + 1] ?? start + 500;
    const segment = text.slice(start, end);
    const monthlyPricePresent = plan.monthlyPrice === "$0"
      ? /\bFree\b/i.test(segment)
      : new RegExp(`${escapeRegExp(plan.monthlyPrice)}\\s*${monthlyCadenceSource}`, "i").test(segment);
    if (!monthlyPricePresent) problems.push(`${plan.name}: monthly price ${plan.monthlyPrice} is missing`);
    if (!new RegExp(`\\b${plan.monthlyCredits}\\s+try-on(?:s)?\\s+credits?\\b`, "i").test(segment)) {
      problems.push(`${plan.name}: ${plan.monthlyCredits} credits are missing`);
    }
    if (
      plan.additionalCreditPrice
      && !new RegExp(
        `(?:Additional credits at ${escapeRegExp(plan.additionalCreditPrice)}|${escapeRegExp(plan.additionalCreditPrice)}${perAdditionalTryOnSource})`,
        "i",
      ).test(segment)
    ) {
      problems.push(`${plan.name}: additional-credit rate ${plan.additionalCreditPrice} is missing`);
    }
    if (requireAnnual && plan.annualPrice && !new RegExp(`${escapeRegExp(plan.annualPrice)}\\s*/\\s*year`, "i").test(segment)) {
      problems.push(`${plan.name}: annual price ${plan.annualPrice} is missing`);
    }
    const monthlyPrices = new Set([...segment.matchAll(new RegExp(`\\$(\\d+(?:\\.\\d+)?)\\s*${monthlyCadenceSource}`, "gi"))].map((match) => `$${match[1]}`));
    const annualPrices = new Set([...segment.matchAll(/\$(\d+(?:\.\d+)?)\s*\/\s*year/gi)].map((match) => `$${match[1]}`));
    const creditAllowances = new Set([...segment.matchAll(/\b([\d,]+)\s+try-on(?:s)?\s+credits?\b/gi)].map((match) => Number(match[1].replaceAll(",", ""))));
    const additionalRates = new Set([
      ...[...segment.matchAll(/Additional credits at \$(\d+(?:\.\d+)?)/gi)].map((match) => `$${match[1]}`),
      ...[...segment.matchAll(new RegExp(`\\$(\\d+(?:\\.\\d+)?)${perAdditionalTryOnSource}`, "gi"))].map((match) => `$${match[1]}`),
    ]);
    for (const price of monthlyPrices) {
      if (price !== plan.monthlyPrice) problems.push(`${plan.name}: conflicting monthly price ${price}`);
    }
    for (const price of annualPrices) {
      if (price !== plan.annualPrice) problems.push(`${plan.name}: conflicting annual price ${price}`);
    }
    for (const allowance of creditAllowances) {
      if (allowance !== plan.monthlyCredits) problems.push(`${plan.name}: conflicting credit allowance ${allowance}`);
    }
    for (const rate of additionalRates) {
      if (rate !== plan.additionalCreditPrice) problems.push(`${plan.name}: conflicting additional-credit rate ${rate}`);
    }
  }
  return problems;
}

function quantifiedClaimHasSupport(context) {
  if (/illustrative example|hypothetical example/i.test(context)) return true;
  return /(?:according to|reported by|measured by|data from|sources?\s*:)[^\n]{0,180}\[[^\]]+\]\(https?:\/\/[^)]+\)/i.test(context);
}

function distributedCommercialProblems(page) {
  const problems = [];
  const approvedMoney = new Set(
    baseline.plans.flatMap((plan) => [plan.monthlyPrice, plan.additionalCreditPrice, plan.annualPrice])
      .filter(Boolean)
      .map((value) => Number(value.slice(1))),
  );
  const approvedCredits = new Set(baseline.plans.map((plan) => plan.monthlyCredits));

  for (const [lineIndex, line] of page.source.split("\n").entries()) {
    const explicitlyHypothetical = /illustrative example|hypothetical example/i.test(line);
    for (const match of line.matchAll(/\$([\d,]+(?:\.\d+)?)/g)) {
      const amount = Number(match[1].replaceAll(",", ""));
      if (!approvedMoney.has(amount) && !explicitlyHypothetical) {
        problems.push(`${page.relative}:${lineIndex + 1}: unapproved commercial amount $${match[1]}`);
      }
    }
    for (const match of line.matchAll(/\b(\d[\d,]*)\s+(?:included\s+)?credits?\b/gi)) {
      const allowance = Number(match[1].replaceAll(",", ""));
      if (!approvedCredits.has(allowance) && !explicitlyHypothetical) {
        problems.push(`${page.relative}:${lineIndex + 1}: unapproved credit allowance ${match[1]}`);
      }
    }

    for (const plan of baseline.plans) {
      const planNameMatch = line.match(new RegExp(`\\b${escapeRegExp(plan.name)}\\b`, "i"));
      if (!planNameMatch) continue;
      const expectedMonthly = Number(plan.monthlyPrice.slice(1));
      const expectedAnnual = plan.annualPrice ? Number(plan.annualPrice.slice(1)) : null;
      const expectedAdditional = plan.additionalCreditPrice ? Number(plan.additionalCreditPrice.slice(1)) : null;
      const planMoneyMatches = [...line.matchAll(/\$([\d,]+(?:\.\d+)?)/g)];
      for (const match of planMoneyMatches) {
        const between = line.slice(
          Math.min(planNameMatch.index, match.index),
          Math.max(planNameMatch.index + planNameMatch[0].length, match.index + match[0].length),
        );
        if (/[.!?]\s/.test(between)) continue;
        const amount = Number(match[1].replaceAll(",", ""));
        const before = line.slice(Math.max(0, match.index - 35), match.index).toLowerCase();
        const after = line.slice(match.index + match[0].length, match.index + match[0].length + 35).toLowerCase();
        if (/^\s*(?:\/|per\s+)\s*month\b/.test(after) && amount !== expectedMonthly) {
          problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} monthly price is $${match[1]}`);
        } else if (/^\s*(?:\/|per\s+)\s*year\b/.test(after) && amount !== expectedAnnual) {
          problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} annual price is $${match[1]}`);
        } else if ((/additional credit/.test(`${before} ${after}`) || /^\s+each\b/.test(after)) && amount !== expectedAdditional) {
          problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} additional-credit rate is $${match[1]}`);
        }
      }
      if (
        planMoneyMatches.length === 1 &&
        !/(?:\/|per\s+)(?:month|year)|additional credit|\beach\b/i.test(line)
      ) {
        const amount = Number(planMoneyMatches[0][1].replaceAll(",", ""));
        if (amount !== expectedMonthly) {
          problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} unlabeled price is $${planMoneyMatches[0][1]}`);
        }
      }
      for (const match of line.matchAll(/\b(\d[\d,]*)\s+(?:included\s+)?credits?\b/gi)) {
        const between = line.slice(
          Math.min(planNameMatch.index, match.index),
          Math.max(planNameMatch.index + planNameMatch[0].length, match.index + match[0].length),
        );
        if (/[.!?]\s/.test(between)) continue;
        const allowance = Number(match[1].replaceAll(",", ""));
        if (allowance !== plan.monthlyCredits) {
          problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} prose allowance is ${match[1]}`);
        }
      }
      const withoutMoney = line.replace(/\$[\d,]+(?:\.\d+)?/g, "");
      if (line.includes("|")) {
        for (const match of withoutMoney.matchAll(/(?:^|\|)\s*\*{0,2}([\d,]+)\*{0,2}\s*(?=\|)/g)) {
          const allowance = Number(match[1].replaceAll(",", ""));
          if (allowance !== plan.monthlyCredits) {
            problems.push(`${page.relative}:${lineIndex + 1}: ${plan.name} table allowance is ${match[1]}`);
          }
        }
      }
    }
  }
  return problems;
}

function validateDocumentationLinks(source, label, routes, currentRoute = "index") {
  const problems = [];
  const machineResources = new Set(["llms.txt", "llms-full.txt", "skill.md"]);

  for (const target of extractLinkTargets(source)) {
    if (target.startsWith("#")) continue;
    if (target.startsWith("/")) {
      problems.push(`${label}: ${target} is root-relative and breaks in Markdown variants`);
      continue;
    }
    const isCanonicalDocsLink = target.startsWith(baseline.site.docsBase);
    const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//");
    if (!isCanonicalDocsLink && hasScheme) continue;

    const cleanTarget = (isCanonicalDocsLink
      ? target.slice(baseline.site.docsBase.length)
      : target)
      .split(/[?#]/, 1)[0];
    if (!cleanTarget || /\.(?:avif|gif|jpe?g|png|svg|webp|pdf|zip)$/i.test(cleanTarget)) continue;

    let route = isCanonicalDocsLink
      ? cleanTarget.replace(/^\//, "")
      : path.posix.normalize(path.posix.join(path.posix.dirname(currentRoute), cleanTarget));
    route = route
      .replace(/^\.\//, "")
      .replace(/\/$/, "")
      .replace(/\.mdx?$/, "");
    if (!route) route = "index";
    if (!routes.includes(route) && !machineResources.has(route)) {
      problems.push(`${label}: ${target} does not map to a documentation source page`);
    }
  }

  return problems;
}

function robotsGroups(source) {
  const groups = [];
  let current = null;

  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (!line) continue;
    const separator = line.indexOf(":");
    if (separator < 0) continue;
    const field = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();

    if (field === "user-agent") {
      if (!current || current.directives.length) {
        current = { agents: [], directives: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if ((field === "allow" || field === "disallow") && current) {
      current.directives.push({ field, value });
    }
  }

  return groups;
}

function robotsSitemaps(source) {
  return source.split(/\r?\n/)
    .map((line) => line.replace(/#.*$/, "").trim())
    .map((line) => line.match(/^sitemap\s*:\s*(\S+)\s*$/i)?.[1])
    .filter(Boolean);
}

function robotsRuleMatches(rule, requestPath) {
  const anchored = rule.endsWith("$");
  const value = anchored ? rule.slice(0, -1) : rule;
  const pattern = value
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${pattern}${anchored ? "$" : ""}`).test(requestPath);
}

function robotsBlocks(source, userAgent, requestPath) {
  const groups = robotsGroups(source);
  const normalizedAgent = userAgent.toLowerCase();
  const specificMatches = groups
    .map((group) => ({
      group,
      matchLength: Math.max(0, ...group.agents
        .filter((agent) => agent !== "*" && normalizedAgent.includes(agent))
        .map((agent) => agent.length)),
    }))
    .filter((entry) => entry.matchLength > 0);
  const longestMatch = Math.max(0, ...specificMatches.map((entry) => entry.matchLength));
  const specific = specificMatches
    .filter((entry) => entry.matchLength === longestMatch)
    .map((entry) => entry.group);
  const matching = specific.length
    ? specific
    : groups.filter((group) => group.agents.includes("*"));
  const applicable = matching
    .flatMap((group) => group.directives)
    .filter((directive) => directive.value && robotsRuleMatches(directive.value, requestPath))
    .sort((a, b) => b.value.length - a.value.length || (a.field === "allow" ? -1 : 1));
  return applicable[0]?.field === "disallow";
}

function crawlerBlockingProblems(source, requestPaths) {
  const problems = [];
  for (const userAgent of crawlerUserAgents) {
    const blockedPaths = requestPaths.filter((requestPath) => robotsBlocks(source, userAgent, requestPath));
    if (blockedPaths.length) {
      problems.push(`${userAgent} is blocked from ${blockedPaths.slice(0, 3).join(", ")}${blockedPaths.length > 3 ? ` and ${blockedPaths.length - 3} more paths` : ""}`);
    }
  }
  return problems;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalizePublishedText(value) {
  return value.replaceAll("\r\n", "\n").trimEnd();
}

const productImageExperienceRequirements = new Map([
  ["index.mdx", [
    "Looksy automatically places the **Try On** button over the main product image",
    "shows the generated preview in that same image area",
    "The Shopify app embed—the theme-wide on/off switch—enables this behavior; it is not a block you place in the page layout.",
  ]],
  ["getting-started/quick-setup.mdx", [
    "The app embed is the theme-wide on/off switch, not a block you place on each product page.",
    "Looksy finds the main product image on eligible product pages and adds the **Try On** button there automatically.",
    "the generated preview appears in the same product-image area",
  ]],
  ["getting-started/first-try-on.mdx", [
    "the **Try On** button over the main product image",
    "the generated preview appears in the same product-image area",
  ]],
  ["integration/theme-setup.mdx", [
    "Looksy automatically places the **Try On** button over the main product image.",
    "You do not add an app block to every product template or choose a page section for Looksy.",
    "the generated preview appears in the same product-image area",
  ]],
  ["about/technology-explained.mdx", [
    "Looksy automatically places the **Try On** button over the main product image.",
    "The Shopify app embed turns this behavior on for the theme. It is not a separate section or app block that merchants place on each product page.",
    "the generated preview appears in the same product-image area",
  ]],
  ["skill.md", [
    "Looksy automatically places the **Try On** button over the main product image",
    "shows the generated preview in that same image area",
    "Do not tell merchants to place a Looksy block on each product page.",
  ]],
  ["llms.txt", [
    "[How Looksy Virtual Try-On Works](https://withlooksy.com/docs/about/technology-explained.md): Understand how shoppers launch Looksy from the main product image",
    "[Theme Integration Guide](https://withlooksy.com/docs/integration/theme-setup.md): Turn on Looksy's Shopify app embed and verify its automatic product-image button and preview",
  ]],
]);

const misleadingManualPlacementPatterns = [
  ["ambiguous placement choice", /\bchoose where try-on should appear\b|\bchoose placement\b/i],
  ["negated automatic placement", /\b(?:does not|doesn't|not) automatically place\b/i],
  ["negated shared result area", /\b(?:does not|doesn't|not) appear in (?:the )?same (?:product-)?image area\b/i],
];

function manualProductPagePlacementProblems(source) {
  const problems = [];
  const segments = source.split(/\n|(?<=[.!?;])\s+/);
  for (const segment of segments) {
    if (/\b(?:do not|does not|don't|doesn't|never|should not|shouldn't|must not|mustn't|cannot|can't|not a (?:separate )?(?:block|section))\b/i.test(segment)) continue;

    const governedTarget = segment.match(
      /\b(?:place|add|position|move)\s+(?:(?:the|a|an|your)\s+)?(?:(?:looksy(?:'s)?|shopify)\s+)?(?<target>app embed|app block|try[- ]on (?:button|entry point|control)|entry point)\b/i,
    )?.groups?.target;
    if (!governedTarget) continue;

    const appEmbed = /app embed/i.test(governedTarget);
    const productPageContext = /\b(?:product (?:page|template|form|image|gallery|evaluation)|page (?:section|layout|template)|below|above)\b/i.test(segment);
    const virtualShowroom = /\bvirtual showroom\b/i.test(segment);
    const buttonAppearanceControl = /\b(?:corner|offset|appearance|style|colour|color|spacing)\b/i.test(segment);

    if (appEmbed || (productPageContext && !virtualShowroom && !buttonAppearanceControl)) {
      problems.push(`manual PDP placement instruction ${JSON.stringify(segment.trim())}`);
    }
  }
  return problems;
}

function productImageExperienceProblems(sources, requirements = productImageExperienceRequirements) {
  const problems = [];
  for (const [relative, requiredStatements] of requirements) {
    const source = sources.get(relative);
    if (!source) {
      problems.push(`${relative}: required positioning source is missing`);
      continue;
    }
    const normalizedSource = source.replace(/\s+/g, " ").trim().toLowerCase();
    for (const statement of requiredStatements) {
      const normalizedStatement = statement.replace(/\s+/g, " ").trim().toLowerCase();
      if (!normalizedSource.includes(normalizedStatement)) {
        problems.push(`${relative}: missing canonical statement ${JSON.stringify(statement)}`);
      }
    }
  }
  for (const [relative, source] of sources) {
    for (const problem of manualProductPagePlacementProblems(source)) {
      problems.push(`${relative}: ${problem}`);
    }
    for (const [label, expression] of misleadingManualPlacementPatterns) {
      if (expression.test(source)) problems.push(`${relative}: contains ${label}`);
    }
  }
  return problems;
}

const mdxFiles = await listFiles(root, ".mdx");
const sourceRoutes = mdxFiles.map((file) =>
  path.relative(root, file).replaceAll(path.sep, "/").replace(/\.mdx$/, ""),
);
const navRoutes = navigationPages(config.navigation);

const auditFixtureProblems = [];
const productImageFixtureRequirements = new Map([
  ["fixture.mdx", [
    "Looksy automatically places the **Try On** button over the main product image.",
    "The generated preview appears in the same product-image area.",
  ]],
]);
const productImageFixture = [
  "Looksy automatically places the **Try On** button over the main product image.",
  "The generated preview appears in the same product-image area.",
].join("\n");
if (productImageExperienceProblems(
  new Map([["fixture.mdx", productImageFixture]]),
  productImageFixtureRequirements,
).length) {
  auditFixtureProblems.push("product-image truth guard rejected affirmative canonical copy");
}
if (!productImageExperienceProblems(
  new Map([["fixture.mdx", `${productImageFixture}\n\nPlace the try-on entry point below the product form.`]]),
  productImageFixtureRequirements,
).length) {
  auditFixtureProblems.push("product-image truth guard accepted contradictory manual-placement copy");
}
if (!productImageExperienceProblems(
  new Map([["fixture.mdx", `${productImageFixture}\n\nPlace the app embed on the product page.`]]),
  productImageFixtureRequirements,
).length) {
  auditFixtureProblems.push("product-image truth guard accepted generic app-embed placement copy");
}
for (const contradictoryCopy of [
  "1. Add the Looksy app block to each product page.",
  'description: "Add the app embed to the product page."',
  "- [Theme setup](/theme): Position the Try On button below the product form.",
]) {
  if (!productImageExperienceProblems(
    new Map([["fixture.mdx", `${productImageFixture}\n\n${contradictoryCopy}`]]),
    productImageFixtureRequirements,
  ).length) {
    auditFixtureProblems.push(`product-image truth guard accepted ${JSON.stringify(contradictoryCopy)}`);
  }
}
if (productImageExperienceProblems(
  new Map([["fixture.mdx", `${productImageFixture}\n\nAdd the Looksy Virtual Showroom app block to a page template.`]]),
  productImageFixtureRequirements,
).length) {
  auditFixtureProblems.push("product-image truth guard rejected the optional Virtual Showroom app block");
}
for (const allowedCopy of [
  "From the app embed settings, move to the storefront preview.",
  "Add your button copy in the app embed settings.",
  "Position the Try On button in the top-right corner of the product image.",
]) {
  if (productImageExperienceProblems(
    new Map([["fixture.mdx", `${productImageFixture}\n\n${allowedCopy}`]]),
    productImageFixtureRequirements,
  ).length) {
    auditFixtureProblems.push(`product-image truth guard rejected ${JSON.stringify(allowedCopy)}`);
  }
}
if (!productImageExperienceProblems(
  new Map([["fixture.mdx", productImageFixture.replace("automatically places", "does not automatically place")]]),
  productImageFixtureRequirements,
).length) {
  auditFixtureProblems.push("product-image truth guard accepted negated automatic-placement copy");
}
const nestedBlockFixture = "User-agent: *\nDisallow: /docs/\n";
if (!robotsBlocks(nestedBlockFixture, "Googlebot", "/docs/page")) {
  auditFixtureProblems.push("robots parser missed a nested /docs/ block");
}
if (robotsBlocks(nestedBlockFixture, "Googlebot", "/docs")) {
  auditFixtureProblems.push("robots parser incorrectly extended /docs/ to /docs");
}
const wildcardFixture = "User-agent: *\nDisallow: /docs/private/*$\n";
if (!robotsBlocks(wildcardFixture, "Googlebot", "/docs/private/page")) {
  auditFixtureProblems.push("robots parser missed wildcard/end-anchor matching");
}
const precedenceFixture = "User-agent: *\nDisallow: /docs/\nUser-agent: OAI-SearchBot\nAllow: /docs/\n";
if (robotsBlocks(precedenceFixture, "OAI-SearchBot", "/docs/page")) {
  auditFixtureProblems.push("robots parser ignored the most-specific user-agent group");
}
const answerEngineBlockFixture = "User-agent: *\nAllow: /\nUser-agent: OAI-SearchBot\nDisallow: /docs/\n";
if (!crawlerBlockingProblems(answerEngineBlockFixture, ["/docs/"]).length) {
  auditFixtureProblems.push("crawler policy guard missed an answer-engine-specific docs block");
}
const nestedSectionBlockFixture = "User-agent: *\nDisallow: /docs/integration/\n";
if (!crawlerBlockingProblems(nestedSectionBlockFixture, ["/docs/integration/gorgias"]).length) {
  auditFixtureProblems.push("crawler policy guard missed a nested documentation-section block");
}
if (robotsSitemaps("# Sitemap: https://invalid.example/sitemap.xml\nSitemap: https://example.com/sitemap.xml\n").length !== 1) {
  auditFixtureProblems.push("robots sitemap parser accepted a commented directive");
}
if (!metaRobotsFromHtml('<meta content="index, noindex" name="robots">').includes("noindex")) {
  auditFixtureProblems.push("meta robots parser depends on attribute order");
}
if (!metaRobotsFromHtml('<meta content="noindex" name="googlebot">', "Googlebot").includes("noindex")) {
  auditFixtureProblems.push("meta robots parser missed a crawler-specific directive");
}
if (!jsonLdTypesFromHtml('<script type="application/ld+json">{"@type":"Article"}</script>').types.has("Article")) {
  auditFixtureProblems.push("JSON-LD parser missed an Article type");
}
const identityFixture = jsonLdTypesFromHtml(`<script type="application/ld+json">{
  "@graph": [
    {"@type":"Organization","@id":"${baseline.site.organizationId}","name":"${baseline.site.name}","legalName":"${baseline.site.legalName}","url":"${baseline.site.homepage}","sameAs":${JSON.stringify(baseline.site.profiles)}},
    {"@type":["Article","TechArticle"],"@id":"fixture#article","publisher":{"@id":"${baseline.site.organizationId}"}}
  ]
}</script>`);
if (structuredDataIdentityProblems(identityFixture, {
  id: baseline.site.organizationId,
  name: baseline.site.name,
  legalName: baseline.site.legalName,
  url: baseline.site.homepage,
  sameAs: baseline.site.profiles,
}).length) {
  auditFixtureProblems.push("structured-data identity validator rejected an approved publisher graph");
}
const staleIdentityFixture = jsonLdTypesFromHtml(`<script type="application/ld+json">{
  "@graph": [
    {"@type":"Organization","@id":"${baseline.site.organizationId}","name":"Looksy Documentation"},
    {"@type":"Article","publisher":{"@id":"https://example.com/#organization"}}
  ]
}</script>`);
if (!structuredDataIdentityProblems(staleIdentityFixture, {
  id: baseline.site.organizationId,
  name: baseline.site.name,
  legalName: baseline.site.legalName,
  url: baseline.site.homepage,
  sameAs: baseline.site.profiles,
}).length) {
  auditFixtureProblems.push("structured-data identity validator accepted a stale publisher graph");
}
if (!validateDocumentationLinks("[broken](../faq/not-a-real-page)", "fixture", sourceRoutes, "getting-started/quick-setup").length) {
  auditFixtureProblems.push("relative-link validator accepted a missing page");
}
if (hasCanonicalDocsLink("[unrelated docs](https://example.com/docs)")) {
  auditFixtureProblems.push("origin llms validator accepted an unrelated /docs link");
}
if (!hasCanonicalDocsLink("[Looksy docs](https://withlooksy.com/docs)")) {
  auditFixtureProblems.push("origin llms validator rejected the canonical docs link");
}
if (unexpectedOpenApiProblem("https://example.com/openapi.json", 404, "")) {
  auditFixtureProblems.push("OpenAPI validator rejected a purged HTTP 404 route");
}
if (unexpectedOpenApiProblem("https://example.com/openapi.json", 410, "")) {
  auditFixtureProblems.push("OpenAPI validator rejected a purged HTTP 410 route");
}
if (!unexpectedOpenApiProblem("https://example.com/openapi.json", 200, "")) {
  auditFixtureProblems.push("OpenAPI validator accepted a live unconfigured route");
}
if (!unexpectedOpenApiProblem("https://example.com/openapi.json", 404, "OpenAPI Plant Store")) {
  auditFixtureProblems.push("OpenAPI validator accepted a sample body on a retired route");
}
const frontmatterFixture = parseFrontmatter('---\ntitle: "Fixture"\ndescription: >\n  A folded description\n  remains readable.\nnoindex: true # temporary\n---\n');
if (frontmatterFixture?.data.noindex !== true || frontmatterFixture?.data.description !== "A folded description remains readable.") {
  auditFixtureProblems.push("frontmatter parser missed typed or folded YAML values");
}
const fullCorpusFixturePages = [
  { relative: "index.mdx", body: "The complete fixture answer is present." },
  { relative: "faq/example.mdx", body: "The complete example answer is present." },
];
const fullCorpusFixture = `# Fixture\nSource: ${baseline.site.docsBase}\n\nThe complete fixture answer is present.\n\n# Example\nSource: ${baseline.site.docsBase}/faq/example\n\nThe complete example answer is present.\n`;
if (llmsFullCoverageProblems(fullCorpusFixture, fullCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator rejected a complete corpus");
}
const generatedCorpusFixturePages = [
  {
    relative: "index.mdx",
    data: { title: "Fixture", description: "A generated description." },
    body: "The current answer costs **$14.99**.",
  },
];
const generatedCorpusFixture = `# Fixture\nSource: ${baseline.site.docsBase}/index\n\nA generated description.\n\nThe current answer costs **\\$14.99**.\n`;
if (llmsFullCoverageProblems(generatedCorpusFixture, generatedCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator rejected Mintlify's index alias, description, or Markdown escaping");
}
const imageCorpusFixturePages = [
  {
    relative: "faq/image-example.mdx",
    data: { title: "Image example", description: "A visual example." },
    body: [
      "The written instruction remains canonical.",
      "",
      '<Frame caption="Current screenshot">',
      '  <img src="/images/example/current.jpg" alt="Current UI." />',
      "</Frame>",
      "",
      "The verification step remains canonical.",
    ].join("\n"),
  },
];
const imageCorpusFixture = `# Image example
Source: ${baseline.site.docsBase}/faq/image-example

A visual example.

The written instruction remains canonical.

<Frame>
  <img alt="Current UI." />
</Frame>

The verification step remains canonical.
`;
if (llmsFullCoverageProblems(imageCorpusFixture, imageCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator rejected Mintlify's generated visual-only Frame");
}
if (!llmsFullCoverageProblems(imageCorpusFixture.replace("verification step", "retired step"), imageCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator hid changed prose around a generated image Frame");
}
if (!llmsFullCoverageProblems(imageCorpusFixture.replace('alt="Current UI."', 'alt="Stale UI."'), imageCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator hid changed generated image alt text");
}
if (!llmsFullCoverageProblems(imageCorpusFixture.replace('\n<Frame>\n  <img alt="Current UI." />\n</Frame>\n', "\n"), imageCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted an omitted image Frame");
}
if (!llmsFullCoverageProblems(imageCorpusFixture.replace(
  '<Frame>\n  <img alt="Current UI." />\n</Frame>',
  '<Frame caption="Changed screenshot">\n  <img src="/images/example/changed.jpg" alt="Current UI." />\n</Frame>',
), imageCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted an unexpected source-form image Frame");
}
if (!llmsFullCoverageProblems(generatedCorpusFixture.replace("A generated description.", "A stale description."), generatedCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted a stale generated description");
}
if (!llmsFullCoverageProblems(generatedCorpusFixture.replace("A generated description.\n\n", ""), generatedCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted a missing generated description");
}
if (!llmsFullCoverageProblems(generatedCorpusFixture.replace("# Fixture", "# Stale fixture"), generatedCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted a stale generated title");
}
if (!llmsFullCoverageProblems(`${generatedCorpusFixture}\n# Duplicate\nSource: ${baseline.site.docsBase}\n\nDuplicate body.\n`, generatedCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted duplicate /docs and /docs/index root markers");
}
const nestedIndexAliasFixture = fullCorpusFixture.replace(
  `${baseline.site.docsBase}/faq/example`,
  `${baseline.site.docsBase}/faq/example/index`,
);
if (!llmsFullCoverageProblems(nestedIndexAliasFixture, fullCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted a nested /index source alias");
}
if (!llmsFullCoverageProblems(`# Fixture\nSource: ${baseline.site.docsBase}\n`, fullCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted a truncated corpus");
}
const markerOnlyFixture = fullCorpusFixturePages
  .map((page) => `# ${page.relative}\nSource: ${expectedLiveUrl(page.relative.replace(/\.mdx$/, ""))}`)
  .join("\n\n");
if (!llmsFullCoverageProblems(markerOnlyFixture, fullCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted markers without page content");
}
if (!llmsFullCoverageProblems(`${fullCorpusFixture}\n# Retired\nSource: ${baseline.site.docsBase}/retired-page\n`, fullCorpusFixturePages).length) {
  auditFixtureProblems.push("llms-full coverage validator accepted an unexpected retired page");
}
if (quantifiedClaimHasSupport("[Shopify](https://shopify.com) is an ecommerce platform. Looksy can increase conversions by 100%.")) {
  auditFixtureProblems.push("quantified-claim validator accepted an unrelated nearby URL");
}
if (!quantifiedClaimHasSupport("According to [the named study](https://example.com/study), the measured conversion increase was 12%.")) {
  auditFixtureProblems.push("quantified-claim validator rejected explicit source attribution");
}
if (normalizedMarkdownBody("```yaml\n  nested: true\n```") === normalizedMarkdownBody("```yaml\nnested: true\n```")) {
  auditFixtureProblems.push("Markdown parity normalization hid indentation-sensitive code changes");
}
if (normalizedMarkdownBody("First paragraph.\n\nSecond paragraph.") === normalizedMarkdownBody("First paragraph.\nSecond paragraph.")) {
  auditFixtureProblems.push("Markdown parity normalization hid a changed paragraph boundary");
}
if (normalizedMarkdownBody("## Current answer") === normalizedMarkdownBody("\\## Current answer")) {
  auditFixtureProblems.push("Markdown parity normalization hid an escaped heading marker");
}
if (normalizedMarkdownBody("Use `\\$TOKEN`.") === normalizedMarkdownBody("Use `$TOKEN`.")) {
  auditFixtureProblems.push("Markdown parity normalization hid an escaped inline-code dollar");
}
if (normalizedMarkdownBody("Use `\\$14.99`.") === normalizedMarkdownBody("Use `$14.99`.")) {
  auditFixtureProblems.push("Markdown parity normalization hid an escaped numeric inline-code dollar");
}
if (normalizedMarkdownBody("Use `` `\\$14.99` ``.") === normalizedMarkdownBody("Use `` `$14.99` ``.")) {
  auditFixtureProblems.push("Markdown parity normalization hid an escaped dollar in multi-backtick inline code");
}
if (
  normalizedMarkdownBody("Use `the literal\n\\$14.99` value.") ===
  normalizedMarkdownBody("Use `the literal\n$14.99` value.")
) {
  auditFixtureProblems.push("Markdown parity normalization hid an escaped dollar in multiline inline code");
}
if (
  normalizedMarkdownBody("Show \\` literally, then pay $14.99.") !==
  normalizedMarkdownBody("Show \\` literally, then pay \\$14.99.")
) {
  auditFixtureProblems.push("Markdown parity normalization treated an escaped backtick as inline code");
}
if (
  normalizedMarkdownBody("Show \\``\\$14.99`.") ===
  normalizedMarkdownBody("Show \\``$14.99`.")
) {
  auditFixtureProblems.push("Markdown parity normalization hid code after an escaped backtick");
}
if (
  normalizedMarkdownBody("Use `the literal\n\\$14.99` then pay $29.") !==
  normalizedMarkdownBody("Use `the literal\n\\$14.99` then pay \\$29.")
) {
  auditFixtureProblems.push("Markdown parity normalization did not reset after multiline inline code");
}
const sourceFormattingFixture = [
  "The plan costs **$14.99**.",
  "",
  "| Plan | Price |",
  "| --- | ---: |",
  "| Starter | $14.99 |",
  "",
  "- Current answer",
  "<CardGroup cols={2}>",
  "<Card>First</Card>",
  "<Card>Second</Card>",
  "</CardGroup>",
  "```text",
  "current answer",
  "```",
].join("\n");
const generatedFormattingFixture = [
  "The plan costs **\\$14.99**.",
  "",
  "| Plan    | Price |",
  "| ------- | ----: |",
  "| Starter | \\$14.99 |",
  "",
  "* Current answer",
  "<CardGroup>",
  "<Card>First</Card>",
  "",
  "<Card>Second</Card>",
  "</CardGroup>",
  "```text theme={null}",
  "current answer",
  "```",
].join("\n");
if (normalizedMarkdownBody(sourceFormattingFixture) !== normalizedMarkdownBody(generatedFormattingFixture)) {
  auditFixtureProblems.push("Markdown parity normalization rejected equivalent generated formatting");
}
const sourceImageFixture = [
  '<Frame caption="Current screenshot">',
  '  <img src="/images/example/current.jpg" alt="Current UI." />',
  '</Frame>',
].join("\n");
const generatedImageFixture = [
  '<Frame caption="Current screenshot">',
  '<img src="https://mintcdn.com/looksy/deploy/images/example/current.jpg?fit=max&amp;auto=format&amp;q=85" alt="Current UI." width="1280" height="720" data-path="images/example/current.jpg" />',
  '</Frame>',
].join("\n");
const fencedImageFixture = `\`\`\`mdx\n${sourceImageFixture}\n\`\`\``;
if (normalizedMarkdownBody(fencedImageFixture, { collapseImageFrameShape: "source" }) !== normalizedMarkdownBody(fencedImageFixture)) {
  auditFixtureProblems.push("llms-full normalization hid an image Frame inside a code fence");
}
const inlineCodeImageFixture = `\`\n${generatedImageFixture}\n\``;
if (normalizedMarkdownBody(inlineCodeImageFixture, { collapseImageFrameShape: "generated" }) !== normalizedMarkdownBody(inlineCodeImageFixture)) {
  auditFixtureProblems.push("Markdown parity normalization rewrote an image inside multiline inline code");
}
if (normalizedMarkdownBody(sourceImageFixture) !== normalizedMarkdownBody(generatedImageFixture)) {
  auditFixtureProblems.push("Markdown parity normalization rejected an equivalent Mintlify image rewrite");
}
if (
  normalizedMarkdownBody(sourceImageFixture) ===
  normalizedMarkdownBody(generatedImageFixture.replace('alt="Current UI."', 'alt="Stale UI."'))
) {
  auditFixtureProblems.push("Markdown parity normalization hid changed image alt text");
}
if (
  normalizedMarkdownBody(sourceImageFixture) ===
  normalizedMarkdownBody(generatedImageFixture.replace("images/example/current.jpg?", "images/example/retired.jpg?"))
) {
  auditFixtureProblems.push("Markdown parity normalization hid a mismatched Mintlify image source");
}
const imageWithSiblingFixture = `${generatedImageFixture.split("\n")[1]}<Panel width="9" />`;
if (normalizedMarkdownBody(imageWithSiblingFixture) !== imageWithSiblingFixture) {
  auditFixtureProblems.push("Markdown parity normalization rewrote a generated image with sibling markup");
}
const nonImageMintlifyFixture = generatedImageFixture.split("\n")[1].replace(/^<img/, "<Widget");
if (normalizedMarkdownBody(nonImageMintlifyFixture) !== nonImageMintlifyFixture) {
  auditFixtureProblems.push("Markdown parity normalization rewrote non-image Mintlify markup");
}
for (const deploymentToken of ["deploy?ignored", "deploy#ignored", "..", "deploy%2Fignored", "deploy%5Cignored"]) {
  const unsafeDeploymentFixture = generatedImageFixture.split("\n")[1].replace("/deploy/", `/${deploymentToken}/`);
  if (normalizedMarkdownBody(unsafeDeploymentFixture) !== unsafeDeploymentFixture) {
    auditFixtureProblems.push(`Markdown parity normalization accepted unsafe Mintlify deployment token ${deploymentToken}`);
  }
}
if (
  normalizedMarkdownBody(sourceFormattingFixture) ===
  normalizedMarkdownBody(generatedFormattingFixture.replace("| Starter | \\$14.99 |", "| Starter | \\$19.99 |"))
) {
  auditFixtureProblems.push("Markdown parity normalization hid changed table content");
}
if (
  normalizedMarkdownBody("| Plan | Price |\n| --- | ---: |") ===
  normalizedMarkdownBody("| Plan | Price |\n| --- | --- |")
) {
  auditFixtureProblems.push("Markdown parity normalization hid changed table alignment");
}
const conflictingCommercialFixture = [
  "Preview Free 25 try-on credits",
  "Starter $14.99/month Additional credits at $0.14 100 try-on credits",
  "Growth $29/month Additional credits at $0.12 300 try-on credits",
  "Scale $79/month $169/month Additional credits at $0.10 600 try-on credits",
].join(" ");
if (!commercialPlanProblems(conflictingCommercialFixture, { requireAnnual: false }).some((problem) => problem.includes("conflicting monthly price $169"))) {
  auditFixtureProblems.push("commercial parity validator accepted current and retired prices together");
}
const homepageCommercialFixture = [
  "Preview images help Starter merchants compare catalogs. Growth guidance helps Scale brands.",
  "Preview Free 25 try-on credits / 30 days",
  "Starter $14.99 / mo 100 try-on credits / mo $0.14 per extra try-on",
  "Growth $29 / mo 300 try-on credits / mo $0.12 per extra try-on",
  "Scale $79 / mo 600 try-on credits / mo $0.10 per extra try-on",
].join(" ");
if (commercialPlanProblems(homepageCommercialFixture, { requireAnnual: false }).length) {
  auditFixtureProblems.push("commercial parity validator rejected the homepage monthly-plan summary");
}
if (!commercialPlanProblems(homepageCommercialFixture, { requireAnnual: true }).some((problem) => problem.includes("annual price"))) {
  auditFixtureProblems.push("commercial parity validator did not require annual prices from an annual-plan surface");
}
const conflictingHomepageCommercialFixture = homepageCommercialFixture.replace(
  "$79 / mo 600 try-on credits / mo $0.10 per extra try-on",
  "$79 / mo $169 / mo 600 try-on credits / mo $0.10 per extra try-on $0.20 per additional try-on",
);
if (!commercialPlanProblems(conflictingHomepageCommercialFixture, { requireAnnual: false }).some((problem) => problem.includes("conflicting monthly price $169"))) {
  auditFixtureProblems.push("commercial parity validator accepted a retired homepage monthly price");
}
if (!commercialPlanProblems(conflictingHomepageCommercialFixture, { requireAnnual: false }).some((problem) => problem.includes("conflicting additional-credit rate $0.20"))) {
  auditFixtureProblems.push("commercial parity validator accepted a retired homepage additional-credit rate");
}
if (!distributedCommercialProblems({
  relative: "fixture.mdx",
  source: "Starter costs $19.99 per month and includes 120 credits.",
}).length) {
  auditFixtureProblems.push("distributed commercial validator accepted an unapproved plan claim");
}
if (!distributedCommercialProblems({
  relative: "fixture.mdx",
  source: "The Starter plan includes 300 credits.",
}).some((problem) => problem.includes("Starter prose allowance is 300"))) {
  auditFixtureProblems.push("distributed commercial validator assigned an approved allowance to the wrong plan");
}
if (auditFixtureProblems.length) fail("Audit regression fixtures", auditFixtureProblems);
else pass("Audit regression fixtures", "robots, metadata, JSON-LD, and relative-link edge cases are enforced");

const configProblems = [];
if (config.$schema !== "https://mintlify.com/docs.json") {
  configProblems.push("$schema must point to the current Mintlify docs.json schema");
}
if (!config.description) configProblems.push("global description is missing");
if (config.seo?.indexing !== "navigable") {
  configProblems.push('seo.indexing must be "navigable"');
}
if (config.seo?.metatags?.canonical !== baseline.site.docsBase) {
  configProblems.push(`canonical base must be ${baseline.site.docsBase}`);
}
const expectedOrganization = {
  id: baseline.site.organizationId,
  name: baseline.site.name,
  legalName: baseline.site.legalName,
  url: baseline.site.homepage,
  sameAs: baseline.site.profiles,
};
const configuredOrganization = config.seo?.organization ?? {};
for (const field of ["id", "name", "legalName", "url"]) {
  if (configuredOrganization[field] !== expectedOrganization[field]) {
    configProblems.push(`organization.${field} must be ${expectedOrganization[field]}`);
  }
}
if (
  JSON.stringify([...(configuredOrganization.sameAs ?? [])].sort()) !==
  JSON.stringify([...expectedOrganization.sameAs].sort())
) {
  configProblems.push("organization.sameAs must match the approved public profiles");
}
if (configProblems.length) fail("Mintlify AEO configuration", configProblems);
else pass("Mintlify AEO configuration", "description, canonical, indexing, and complete entity identity are explicit");

try {
  await readFile(path.join(root, "schemarabbit.js"), "utf8");
  fail("Structured-data ownership", "schemarabbit.js is present; Mintlify auto-loads root JavaScript and already emits first-party JSON-LD");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  pass("Structured-data ownership", "legacy SchemaRabbit injection is absent; Mintlify owns documentation JSON-LD");
}

const duplicateNavRoutes = navRoutes.filter((route, index) => navRoutes.indexOf(route) !== index);
const missingFromSource = navRoutes.filter((route) => !sourceRoutes.includes(route));
const missingFromNavigation = sourceRoutes.filter((route) => !navRoutes.includes(route));
if (duplicateNavRoutes.length || missingFromSource.length || missingFromNavigation.length) {
  fail("Navigation coverage", {
    duplicateNavRoutes: [...new Set(duplicateNavRoutes)],
    missingFromSource,
    missingFromNavigation,
  });
} else {
  pass("Navigation coverage", `${sourceRoutes.length} MDX pages are present exactly once in navigation`);
}

const redirects = Array.isArray(config.redirects) ? config.redirects : [];
function declaredPermanentRedirect(route) {
  const sourcePath = route === "index" ? "/" : `/${route}`;
  const redirect = redirects.find((entry) => entry.source === sourcePath && entry.permanent !== false);
  if (!redirect) return null;
  const destination = redirect.destination?.replace(/^\//, "").replace(/\/$/, "") || "index";
  if (!sourceRoutes.includes(destination)) return null;
  return { redirect, destination };
}
const unregisteredCurrentRoutes = navRoutes.filter((route) => !(baseline.protectedRoutes ?? []).includes(route));
const previousRouteInventory = await previousProtectedRouteInventory();
const prunedProtectedRoutes = previousRouteInventory
  ? previousRouteInventory.routes.filter((route) => !(baseline.protectedRoutes ?? []).includes(route))
  : [];
const unprotectedRemovedRoutes = (baseline.protectedRoutes ?? []).filter((route) => {
  if (sourceRoutes.includes(route)) return false;
  return !declaredPermanentRedirect(route);
});
if (unprotectedRemovedRoutes.length || unregisteredCurrentRoutes.length || prunedProtectedRoutes.length) {
  fail("Protected route continuity", [
    ...unprotectedRemovedRoutes.map((route) => `${route}: missing without a permanent redirect to a current page`),
    ...unregisteredCurrentRoutes.map((route) => `${route}: current route is missing from the append-only protected inventory`),
    ...prunedProtectedRoutes.map((route) => `${route}: removed from the protected inventory recorded at ${previousRouteInventory.reference}`),
  ]);
} else {
  pass("Protected route continuity", `${(baseline.protectedRoutes ?? []).length} established routes remain published or permanently redirected`);
}

const parsedPages = [];
const frontmatterProblems = [];
for (const file of mdxFiles) {
  const relative = path.relative(root, file).replaceAll(path.sep, "/");
  const source = await readFile(file, "utf8");
  const parsed = parseFrontmatter(source);
  if (!parsed) {
    frontmatterProblems.push(`${relative}: missing frontmatter`);
    continue;
  }
  if (typeof parsed.data.title !== "string" || !parsed.data.title.trim()) {
    frontmatterProblems.push(`${relative}: missing or non-string title`);
  }
  if (typeof parsed.data.description !== "string" || !parsed.data.description.trim()) {
    frontmatterProblems.push(`${relative}: missing or non-string description`);
  }
  if (parsed.data.noindex === true || /^true$/i.test(String(parsed.data.noindex ?? ""))) {
    frontmatterProblems.push(`${relative}: noindex is enabled`);
  }
  parsedPages.push({ file, relative, source, ...parsed });
}

for (const field of ["title", "description"]) {
  const values = new Map();
  for (const page of parsedPages) {
    const value = page.data[field];
    if (!value) continue;
    const previous = values.get(value);
    if (previous) frontmatterProblems.push(`${page.relative}: duplicate ${field} also used by ${previous}`);
    else values.set(value, page.relative);
  }
}

if (frontmatterProblems.length) fail("Page metadata", frontmatterProblems);
else pass("Page metadata", `${parsedPages.length} pages have unique titles and descriptions and are indexable`);

function renderLlmsIndex(pages) {
  const entries = pages
    .map((page) => ({
      route: page.relative.replace(/\.mdx$/, ""),
      title: page.data.title,
      description: page.data.description,
    }))
    .sort((a, b) => a.route.localeCompare(b.route));

  return [
    `# ${config.name}`,
    "",
    `> ${config.description}`,
    "",
    "## Docs",
    "",
    ...entries.map(
      (entry) =>
        `- [${entry.title}](${baseline.site.docsBase}/${entry.route}.md): ${entry.description}`,
    ),
    "",
  ].join("\n");
}

const expectedLlmsIndex = renderLlmsIndex(parsedPages);
if (args.has("--write-ai-index")) {
  await writeFile(path.join(root, "llms.txt"), expectedLlmsIndex);
}

const aiSourceProblems = [];
let sourceLlms = "";
let sourceSkill = "";
try {
  sourceLlms = await readFile(path.join(root, "llms.txt"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  aiSourceProblems.push("llms.txt is missing");
}
try {
  sourceSkill = await readFile(path.join(root, "skill.md"), "utf8");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
  aiSourceProblems.push("skill.md is missing");
}
if (sourceLlms && sourceLlms !== expectedLlmsIndex) {
  aiSourceProblems.push("llms.txt is stale; run node scripts/aeo-audit.mjs --write-ai-index");
}
if (/OpenAPI Plant Store|api-reference\/openapi\.json/i.test(sourceLlms)) {
  aiSourceProblems.push("llms.txt advertises an unrelated sample OpenAPI");
}
for (const plan of baseline.plans) {
  const row = expectedPlanRow(plan);
  if (sourceSkill && !sourceSkill.includes(row)) {
    aiSourceProblems.push(`skill.md is missing the approved ${plan.name} plan row`);
  }
}
for (const entry of baseline.forbiddenContentPatterns) {
  const expression = new RegExp(entry.pattern, "i");
  const match = sourceSkill.match(expression);
  if (match) aiSourceProblems.push(`skill.md contains ${match[0]} (${entry.reason})`);
}
for (const problem of validateDocumentationLinks(sourceSkill, "skill.md", sourceRoutes, "index")) {
  aiSourceProblems.push(problem);
}
if (aiSourceProblems.length) fail("AI discovery source", aiSourceProblems);
else pass("AI discovery source", "reviewed llms.txt and skill.md agree with navigation and commercial facts");

const productImageTruthSources = new Map(
  parsedPages.map((page) => [page.relative, page.source]),
);
productImageTruthSources.set("skill.md", sourceSkill);
productImageTruthSources.set("llms.txt", sourceLlms);
const productImageTruthProblems = productImageExperienceProblems(productImageTruthSources);
if (productImageTruthProblems.length) fail("Product-image experience truth", productImageTruthProblems);
else pass(
  "Product-image experience truth",
  "primary docs and AI surfaces distinguish the automatic product-image experience from the app-embed activation step",
);

const rootDiscoverySourceProblems = [];
let sourceRootRobots = "";
let sourceRootLegacyManifest = "";
let sourceRootLegacySkill = "";
try {
  sourceRootRobots = await readFile(path.join(root, "root-discovery", "robots.txt"), "utf8");
  const expectedSitemaps = [
    `${baseline.site.homepage}/sitemap.xml`,
    `${baseline.site.docsBase}/sitemap.xml`,
  ];
  for (const sitemap of expectedSitemaps) {
    if (!robotsSitemaps(sourceRootRobots).includes(sitemap)) {
      rootDiscoverySourceProblems.push(`root-discovery/robots.txt is missing ${sitemap}`);
    }
  }
  const sourceDocsPaths = [...new Set([
    "/docs",
    "/docs/",
    ...navRoutes.map((route) => new URL(expectedLiveUrl(route)).pathname),
  ])];
  rootDiscoverySourceProblems.push(...crawlerBlockingProblems(sourceRootRobots, sourceDocsPaths));

  sourceRootLegacyManifest = await readFile(
    path.join(root, "root-discovery", ".well-known", "skills", "index.json"),
    "utf8",
  );
  const sourceLegacyManifest = JSON.parse(sourceRootLegacyManifest);
  sourceRootLegacySkill = await readFile(
    path.join(root, "root-discovery", ".well-known", "skills", "looksy", "SKILL.md"),
    "utf8",
  );
  const looksySkill = sourceLegacyManifest.skills?.find(
    (entry) => entry.name?.toLowerCase() === "looksy",
  );
  if (!looksySkill?.files?.includes("skill.md")) {
    rootDiscoverySourceProblems.push("root legacy manifest does not advertise the public lowercase skill.md path");
  }
  if (sourceRootLegacySkill !== sourceSkill) {
    rootDiscoverySourceProblems.push("root legacy SKILL.md does not match the reviewed source skill.md");
  }
} catch (error) {
  rootDiscoverySourceProblems.push(error.message);
}
if (rootDiscoverySourceProblems.length) fail("Root discovery source", rootDiscoverySourceProblems);
else pass("Root discovery source", "Framer-hosted robots, manifest, and skill sources are complete and consistent");

const brokenInternalLinks = [];
for (const page of parsedPages) {
  brokenInternalLinks.push(...validateDocumentationLinks(
    page.body,
    page.relative,
    sourceRoutes,
    page.relative.replace(/\.mdx$/, ""),
  ));
}
if (brokenInternalLinks.length) fail("Internal documentation links", brokenInternalLinks);
else pass("Internal documentation links", "documentation links remain valid in both rendered HTML and Markdown variants");

const staleMatches = [];
for (const page of parsedPages) {
  for (const entry of baseline.forbiddenContentPatterns) {
    const expression = new RegExp(entry.pattern, "gi");
    for (const match of page.source.matchAll(expression)) {
      staleMatches.push({
        file: page.relative,
        line: lineNumberAt(page.source, match.index),
        match: match[0],
        reason: entry.reason,
      });
    }
  }
}
if (staleMatches.length) fail("Factual drift guard", staleMatches);
else pass("Factual drift guard", `${baseline.forbiddenContentPatterns.length} retired or unsupported claim patterns are absent`);

const pricingPage = parsedPages.find((page) => page.relative === "faq/pricing-and-plans.mdx");
const pricingProblems = [];
if (!pricingPage) {
  pricingProblems.push("faq/pricing-and-plans.mdx is missing");
} else {
  for (const plan of baseline.plans) {
    const row = expectedPlanRow(plan);
    if (!pricingPage.source.includes(row)) {
      pricingProblems.push(`${plan.name}: approved plan row is missing or its fields are not plan-scoped`);
    }
  }
  for (const url of [baseline.site.homepage, baseline.site.shopifyListing]) {
    if (!pricingPage.source.includes(url)) pricingProblems.push(`missing primary source link ${url}`);
  }
}
if (pricingProblems.length) fail("Canonical pricing answer", pricingProblems);
else pass("Canonical pricing answer", "all current plans and primary source links are present");

const distributedCommercialFactProblems = parsedPages.flatMap(distributedCommercialProblems);
if (distributedCommercialFactProblems.length) fail("Distributed commercial facts", distributedCommercialFactProblems);
else pass("Distributed commercial facts", "all monetary amounts, credit allowances, and plan-scoped terms use approved current values");

const unsupportedClaimProblems = [];
const broadClaimPatterns = [
  /(?:increase|lift|boost)[^\n]{0,60}\b\d{1,3}(?:\.\d+)?(?:\s*[–-]\s*\d{1,3}(?:\.\d+)?)?%/gi,
  /(?:reduce|decrease|lower)[^\n]{0,60}\b\d{1,3}(?:\.\d+)?(?:\s*[–-]\s*\d{1,3}(?:\.\d+)?)?%/gi,
  /\b\d{1,3}x\s+(?:return|ROI)\b/gi,
];
for (const page of parsedPages) {
  for (const expression of broadClaimPatterns) {
    for (const match of page.source.matchAll(expression)) {
      const paragraphStart = page.source.lastIndexOf("\n\n", match.index);
      const paragraphEnd = page.source.indexOf("\n\n", match.index + match[0].length);
      const contextStart = paragraphStart < 0 ? 0 : paragraphStart + 2;
      const contextEnd = paragraphEnd < 0 ? page.source.length : paragraphEnd;
      const context = page.source.slice(contextStart, contextEnd);
      if (!quantifiedClaimHasSupport(context)) {
        unsupportedClaimProblems.push(`${page.relative}:${lineNumberAt(page.source, match.index)}: ${match[0]}`);
      }
    }
  }
}
if (unsupportedClaimProblems.length) fail("Quantified-claim guard", unsupportedClaimProblems);
else pass("Quantified-claim guard", "quantified outcome claims have a source or are explicitly hypothetical");

for (const override of ["robots.txt", "sitemap.xml", "llms-full.txt"]) {
  try {
    await readFile(path.join(root, override));
    warn("Mintlify generated-file override", `${override} exists in source and overrides Mintlify generation`);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
}

if (liveMode) {
  const liveFileBodies = new Map();
  const originFileBodies = new Map();
  await mapLimit(baseline.requiredLiveFiles, 6, async (liveFile) => {
    const url = `${baseline.site.docsBase}/${liveFile}`;
    try {
      const { response, body } = await fetchText(url);
      const problems = machineResourceProblems(liveFile, response, body);
      if (problems.length) {
        fail(`Live ${liveFile}`, problems);
      } else {
        liveFileBodies.set(liveFile, body);
        pass(`Live ${liveFile}`, `HTTP ${response.status}; ${body.length} bytes`);
      }
    } catch (error) {
      fail(`Live ${liveFile}`, error.message);
    }
  });

  await mapLimit(baseline.requiredOriginDiscoveryFiles, 4, async (liveFile) => {
    const url = `${baseline.site.homepage}/${liveFile}`;
    try {
      const { response, body } = await fetchText(url);
      const problems = machineResourceProblems(liveFile, response, body);
      if (problems.length) fail(`Origin discovery ${liveFile}`, problems);
      else {
        originFileBodies.set(liveFile, body);
        pass(`Origin discovery ${liveFile}`, `HTTP ${response.status}; ${body.length} bytes`);
      }
    } catch (error) {
      fail(`Origin discovery ${liveFile}`, error.message);
    }
  });

  const originDiscoveryProblems = [];
  const originSkill = originFileBodies.get("skill.md") ?? "";
  const originLegacyManifestText = originFileBodies.get(".well-known/skills/index.json") ?? "";
  const originLegacySkill = originFileBodies.get(".well-known/skills/looksy/skill.md") ?? "";
  if (originSkill && originSkill !== sourceSkill) {
    originDiscoveryProblems.push("root skill.md does not match the reviewed source skill.md");
  }
  if (originLegacySkill && originLegacySkill !== sourceSkill) {
    originDiscoveryProblems.push("root legacy skill does not match the reviewed source skill.md");
  }
  if (
    originLegacyManifestText &&
    originLegacyManifestText !== sourceRootLegacyManifest
  ) {
    originDiscoveryProblems.push("root legacy manifest does not match its reviewed repository source");
  }
  try {
    const originLegacyManifest = JSON.parse(originLegacyManifestText || "{}");
    const originLegacyEntry = originLegacyManifest.skills?.find(
      (entry) => entry.name?.toLowerCase() === "looksy",
    );
    if (!originLegacyEntry?.files?.includes("skill.md")) {
      originDiscoveryProblems.push("root legacy manifest does not advertise the public lowercase skill.md path");
    } else {
      const advertisedPath = `.well-known/skills/${originLegacyEntry.name}/skill.md`;
      if (!originFileBodies.has(advertisedPath)) {
        originDiscoveryProblems.push(`root legacy manifest path /${advertisedPath} was not fetched successfully`);
      }
    }
  } catch (error) {
    originDiscoveryProblems.push(`root legacy manifest is invalid: ${error.message}`);
  }
  if (originDiscoveryProblems.length) fail("Origin discovery integrity", originDiscoveryProblems);
  else if (baseline.requiredOriginDiscoveryFiles.every((liveFile) => originFileBodies.has(liveFile))) {
    pass("Origin discovery integrity", "root discovery resources match their reviewed Framer source files");
  }

  try {
    const { response, body } = await fetchText(`${baseline.site.homepage}/llms.txt`);
    const rootLlmsProblems = machineResourceProblems("llms.txt", response, body);
    if (!hasCanonicalDocsLink(body)) {
      rootLlmsProblems.push("main-site llms.txt does not include a Markdown link to Looksy documentation");
    }
    if (body !== sourceLlms) {
      rootLlmsProblems.push("main-site llms.txt does not match its reviewed repository source");
    }
    for (const entry of baseline.forbiddenContentPatterns) {
      const match = body.match(new RegExp(entry.pattern, "i"));
      if (match) rootLlmsProblems.push(`${match[0]} (${entry.reason})`);
    }
    if (rootLlmsProblems.length) fail("Origin llms.txt", rootLlmsProblems);
    else pass("Origin llms.txt", "the main-site answer index links to docs and avoids retired or unsupported claims");
  } catch (error) {
    fail("Origin llms.txt", error.message);
  }

  try {
    const [homepage, shopifyListing] = await Promise.all([
      fetchText(`${baseline.site.homepage}/`),
      fetchText(baseline.site.shopifyListing),
    ]);
    const commercialProblems = [];
    if (!homepage.response.ok) commercialProblems.push(`homepage: HTTP ${homepage.response.status}`);
    else commercialProblems.push(...commercialPlanProblems(homepage.body, { requireAnnual: false }).map((problem) => `homepage: ${problem}`));
    if (!shopifyListing.response.ok) commercialProblems.push(`Shopify listing: HTTP ${shopifyListing.response.status}`);
    else commercialProblems.push(...commercialPlanProblems(shopifyListing.body, { requireAnnual: false }).map((problem) => `Shopify listing: ${problem}`));
    if (commercialProblems.length) fail("Current commercial source parity", commercialProblems);
    else pass("Current commercial source parity", "homepage and Shopify listing match every approved plan price, allowance, and additional-credit rate");
  } catch (error) {
    fail("Current commercial source parity", error.message);
  }

  const aiIntegrityProblems = [];
  const liveSkill = liveFileBodies.get("skill.md") ?? "";
  const liveLlms = liveFileBodies.get("llms.txt") ?? "";
  if (liveSkill && normalizePublishedText(liveSkill) !== normalizePublishedText(sourceSkill)) {
    aiIntegrityProblems.push("live skill.md does not match the reviewed source skill.md");
  }
  if (liveLlms && normalizePublishedText(liveLlms) !== normalizePublishedText(sourceLlms)) {
    aiIntegrityProblems.push("live llms.txt does not match the reviewed source llms.txt");
  }
  for (const liveFile of baseline.requiredLiveFiles.filter(
    (name) => !["robots.txt", "sitemap.xml"].includes(name),
  )) {
    const body = liveFileBodies.get(liveFile) ?? "";
    for (const entry of baseline.forbiddenContentPatterns) {
      const match = body.match(new RegExp(entry.pattern, "i"));
      if (match) aiIntegrityProblems.push(`${liveFile}: ${match[0]} (${entry.reason})`);
    }
  }
  try {
    const agentManifest = JSON.parse(liveFileBodies.get(".well-known/agent-skills/index.json") ?? "{}");
    const legacyManifest = JSON.parse(liveFileBodies.get(".well-known/skills/index.json") ?? "{}");
    const agentCard = JSON.parse(liveFileBodies.get(".well-known/agent-card.json") ?? "{}");
    const manifestSkill = agentManifest.skills?.find((entry) => entry.name === "looksy");
    const legacySkill = legacyManifest.skills?.find((entry) => entry.name === "looksy");
    const cardSkill = agentCard.skills?.find((entry) => entry.id === "looksy");
    if (!manifestSkill?.url || !manifestSkill?.digest) {
      aiIntegrityProblems.push("agent-skills manifest is missing the Looksy URL or digest");
    } else {
      const skillUrl = new URL(manifestSkill.url, baseline.site.homepage);
      if (!skillUrl.href.startsWith(`${baseline.site.docsBase}/.well-known/agent-skills/`)) {
        aiIntegrityProblems.push(`agent-skills manifest points outside canonical docs discovery: ${skillUrl.href}`);
      } else {
        const { response, body } = await fetchText(skillUrl.href);
        if (!response.ok) aiIntegrityProblems.push(`manifest skill URL returns HTTP ${response.status}`);
        const expectedDigest = `sha256:${sha256(body)}`;
        if (manifestSkill.digest !== expectedDigest) {
          aiIntegrityProblems.push("agent-skills manifest digest does not match its published skill content");
        }
        if (normalizePublishedText(body) !== normalizePublishedText(sourceSkill)) {
          aiIntegrityProblems.push("agent-skills manifest content does not match reviewed source skill.md");
        }
        const cardSkillUrl = cardSkill?.url ? new URL(cardSkill.url, baseline.site.homepage).href : null;
        if (cardSkillUrl !== skillUrl.href) {
          aiIntegrityProblems.push("agent card and agent-skills manifest advertise different Looksy skill URLs");
        }
      }
    }
    if (!legacySkill?.files?.some((file) => file.toLowerCase() === "skill.md")) {
      aiIntegrityProblems.push("legacy skills manifest does not advertise Looksy SKILL.md");
    }
    if (agentCard.documentationUrl?.replace(/\/$/, "") !== baseline.site.docsBase) {
      aiIntegrityProblems.push("agent card documentationUrl is not the canonical docs URL");
    }
  } catch (error) {
    aiIntegrityProblems.push(`skill discovery integrity check failed: ${error.message}`);
  }
  if (aiIntegrityProblems.length) fail("Live AI discovery integrity", aiIntegrityProblems);
  else pass("Live AI discovery integrity", "reviewed AI indexes, skill content, manifests, agent card, and digest agree");

  const sitemap = liveFileBodies.get("sitemap.xml");
  const sitemapUrls = sitemap
    ? [...sitemap.matchAll(/<loc>([\s\S]*?)<\/loc>/gi)].map((match) => decodeXml(match[1].trim()))
    : [];
  const expectedUrls = navRoutes.map(expectedLiveUrl);
  const missingLiveRoutes = expectedUrls.filter((url) => !sitemapUrls.includes(url));
  const unexpectedLiveRoutes = sitemapUrls.filter((url) => !expectedUrls.includes(url));
  const foreignUrls = sitemapUrls.filter((url) => !url.startsWith(baseline.site.docsBase));
  if (
    missingLiveRoutes.length ||
    unexpectedLiveRoutes.length ||
    foreignUrls.length
  ) {
    fail("Live sitemap coverage", {
      count: sitemapUrls.length,
      expectedCount: expectedUrls.length,
      missingLiveRoutes,
      unexpectedLiveRoutes,
      foreignUrls,
    });
  } else {
    pass("Live sitemap coverage", `${sitemapUrls.length} documentation URLs include every navigated source page`);
  }

  const liveRedirectProblems = [];
  const removedProtectedRoutes = (baseline.protectedRoutes ?? []).filter((route) => !sourceRoutes.includes(route));
  await mapLimit(removedProtectedRoutes, 4, async (route) => {
    const declaration = declaredPermanentRedirect(route);
    if (!declaration) return;
    const sourceUrl = expectedLiveUrl(route);
    const expectedDestination = expectedLiveUrl(declaration.destination).replace(/\/$/, "");
    try {
      const { response } = await fetchText(sourceUrl, { redirect: "manual" });
      const location = response.headers.get("location");
      const resolvedLocation = location ? new URL(location, sourceUrl).href.replace(/\/$/, "") : null;
      if (response.status !== 308) liveRedirectProblems.push(`${route}: expected HTTP 308, received ${response.status}`);
      if (resolvedLocation !== expectedDestination) {
        liveRedirectProblems.push(`${route}: expected Location ${expectedDestination}, received ${resolvedLocation ?? "missing"}`);
      }
      const destination = await fetchText(expectedDestination, { headers: { accept: "text/html" } });
      if (!destination.response.ok) liveRedirectProblems.push(`${route}: destination returns HTTP ${destination.response.status}`);
    } catch (error) {
      liveRedirectProblems.push(`${route}: ${error.message}`);
    }
  });
  if (liveRedirectProblems.length) fail("Live protected redirects", liveRedirectProblems);
  else pass("Live protected redirects", `${removedProtectedRoutes.length} retired routes have verified permanent redirects`);

  try {
    const { response, body } = await fetchText(`${baseline.site.homepage}/robots.txt`);
    const originRobotsProblems = machineResourceProblems("robots.txt", response, body);
    if (body !== sourceRootRobots) {
      originRobotsProblems.push("root robots.txt does not match its reviewed repository source");
    }
    if (!robotsSitemaps(body).includes(`${baseline.site.docsBase}/sitemap.xml`)) {
      originRobotsProblems.push("root robots.txt does not advertise the docs sitemap");
    }
    const docsPaths = [...new Set([
      "/docs",
      "/docs/",
      ...expectedUrls.map((url) => new URL(url).pathname),
    ])];
    originRobotsProblems.push(...crawlerBlockingProblems(body, docsPaths));
    if (originRobotsProblems.length) fail("Origin robots policy", originRobotsProblems);
    else pass("Origin robots policy", "root robots.txt advertises the docs sitemap and permits representative crawlers");
  } catch (error) {
    fail("Origin robots policy", error.message);
  }

  const pageProblems = [];
  await mapLimit(sitemapUrls, 8, async (url) => {
    try {
      const { response, body } = await fetchText(url, { headers: { accept: "text/html" } });
      const canonical = canonicalFromHtml(body)?.replace(/\/$/, "");
      const expectedCanonical = url.replace(/\/$/, "");
      const h1Count = (body.match(/<h1\b/gi) ?? []).length;
      const jsonLd = jsonLdTypesFromHtml(body);
      const genericMetaRobots = metaRobotsFromHtml(body);
      if (!response.ok) pageProblems.push(`${url}: HTTP ${response.status}`);
      if (genericMetaRobots.includes("noindex")) {
        pageProblems.push(`${url}: meta robots noindex`);
      }
      for (const userAgent of crawlerUserAgents) {
        if (!genericMetaRobots.includes("noindex") && metaRobotsFromHtml(body, userAgent).includes("noindex")) {
          pageProblems.push(`${url}: ${userAgent}-specific meta robots noindex`);
        }
      }
      if (/\bnoindex\b/i.test(response.headers.get("x-robots-tag") ?? "")) {
        pageProblems.push(`${url}: X-Robots-Tag noindex`);
      }
      if (canonical !== expectedCanonical) {
        pageProblems.push(`${url}: canonical ${canonical ?? "missing"}`);
      }
      if (h1Count !== 1) pageProblems.push(`${url}: expected one H1, found ${h1Count}`);
      if (/schemarabbit/i.test(body)) pageProblems.push(`${url}: legacy SchemaRabbit injection is still served`);
      if (jsonLd.invalidScripts) pageProblems.push(`${url}: ${jsonLd.invalidScripts} invalid JSON-LD script(s)`);
      if (!["Article", "TechArticle"].some((type) => jsonLd.types.has(type))) {
        pageProblems.push(`${url}: Article or TechArticle JSON-LD missing`);
      }
      for (const problem of structuredDataIdentityProblems(jsonLd, expectedOrganization)) {
        pageProblems.push(`${url}: ${problem}`);
      }
    } catch (error) {
      pageProblems.push(`${url}: ${error.message}`);
    }
  });
  if (pageProblems.length) fail("Live page crawlability", pageProblems);
  else pass("Live page crawlability", `${sitemapUrls.length} pages return indexable, self-canonical HTML with one H1 and article schema`);

  const llms = liveFileBodies.get("llms.txt") ?? "";
  const missingLlmsRoutes = navRoutes.filter((route) => {
    const expected = `${baseline.site.docsBase}/${route}.md`;
    return !llms.includes(expected);
  });
  if (/OpenAPI Plant Store|api-reference\/openapi\.json/i.test(llms)) {
    missingLlmsRoutes.push("unexpected sample OpenAPI is advertised");
  }
  if (missingLlmsRoutes.length) fail("Live llms.txt coverage", missingLlmsRoutes);
  else pass("Live llms.txt coverage", `${navRoutes.length} navigated pages have Markdown discovery links`);

  const llmsFullProblems = llmsFullCoverageProblems(
    liveFileBodies.get("llms-full.txt") ?? "",
    parsedPages,
  );
  if (llmsFullProblems.length) fail("Live llms-full.txt coverage", llmsFullProblems);
  else pass("Live llms-full.txt coverage", `${parsedPages.length} source markers appear exactly once in the full answer corpus`);

  const markdownProblems = [];
  await mapLimit(navRoutes, 8, async (route) => {
    const url = `${baseline.site.docsBase}/${route}.md`;
    try {
      const { response, body } = await fetchText(url, { headers: { accept: "text/markdown" } });
      if (!response.ok || body.length < 100) markdownProblems.push(`${url}: HTTP ${response.status} or empty body`);
      markdownProblems.push(...validateDocumentationLinks(body, url, sourceRoutes, route));
      const page = parsedPages.find((entry) => entry.relative === `${route}.mdx`);
      if (page) {
        const expectedBody = normalizedMarkdownBody(page.body);
        const publishedBody = normalizedMarkdownBody(liveMarkdownBody(body, page));
        if (publishedBody !== expectedBody) {
          markdownProblems.push(`${url}: published body does not match source (${sha256(publishedBody).slice(0, 12)} != ${sha256(expectedBody).slice(0, 12)})`);
        }
      }
    } catch (error) {
      markdownProblems.push(`${url}: ${error.message}`);
    }
  });
  if (markdownProblems.length) fail("Live Markdown variants", markdownProblems);
  else pass("Live Markdown variants", `${navRoutes.length} Markdown answers are served without bare-origin links`);

  if (!config.api?.openapi) {
    const openApiUrls = [...new Set([
      `${baseline.site.docsBase}/api-reference/openapi.json`,
      `${baseline.site.mintlifyOrigin}/api-reference/openapi.json`,
    ])];
    const openApiProbes = new Array(openApiUrls.length);
    await mapLimit(openApiUrls, 2, async (url, index) => {
      try {
        const { response, body } = await fetchText(url);
        const sampleDetected = /OpenAPI Plant Store/i.test(body);
        openApiProbes[index] = {
          url,
          status: response.status,
          sampleDetected,
          retired: (response.status === 404 || response.status === 410) && !sampleDetected,
        };
      } catch (error) {
        openApiProbes[index] = { url, error: error.message, retired: false };
      }
    });
    const openApiProblems = openApiProbes
      .map((probe) => probe.error
        ? `${probe.url}: ${probe.error}`
        : unexpectedOpenApiProblem(probe.url, probe.status, probe.sampleDetected ? "OpenAPI Plant Store" : ""))
      .filter(Boolean);
    const openApiDetails = {
      summary: `${openApiProbes.filter((probe) => probe.retired).length}/${openApiProbes.length} unconfigured OpenAPI routes are retired`,
      probes: openApiProbes,
    };
    if (openApiProblems.length) fail("Unexpected OpenAPI surface", { ...openApiDetails, problems: openApiProblems });
    else pass("Unexpected OpenAPI surface", openApiDetails);
  }

  const livePricingUrl = `${baseline.site.docsBase}/faq/pricing-and-plans.md`;
  try {
    const { response, body } = await fetchText(livePricingUrl, { headers: { accept: "text/markdown" } });
    const normalizedBody = normalizedMarkdownBody(body);
    const missingPlanRows = baseline.plans
      .filter((plan) => !normalizedBody.includes(normalizedMarkdownBody(expectedPlanRow(plan))))
      .map((plan) => plan.name);
    const missingPrimarySources = [baseline.site.homepage, baseline.site.shopifyListing]
      .filter((url) => !body.includes(url));
    const retiredMatches = baseline.forbiddenContentPatterns
      .filter((entry) => new RegExp(entry.pattern, "i").test(body))
      .map((entry) => entry.reason);
    if (!response.ok || missingPlanRows.length || missingPrimarySources.length || retiredMatches.length) {
      fail("Live pricing answer", {
        status: response.status,
        missingPlanRows,
        missingPrimarySources,
        retiredMatches,
      });
    } else {
      pass("Live pricing answer", "all plan-scoped monthly, annual, credit, and additional-credit facts are served");
    }
  } catch (error) {
    fail("Live pricing answer", error.message);
  }

  const botProblems = [];
  const botIndexingWarnings = [];
  const crawlerProbeRoutes = [];
  const crawlerProbeSections = new Set();
  for (const route of navRoutes) {
    const section = route === "index" ? "index" : route.split("/", 1)[0];
    if (!crawlerProbeSections.has(section)) {
      crawlerProbeSections.add(section);
      crawlerProbeRoutes.push(route);
    }
  }
  const botRequests = crawlerUserAgents
    .flatMap((userAgent) => crawlerProbeRoutes
      .flatMap((route) => ["text/html", "*/*"].map((accept) => ({ userAgent, accept, route }))));
  await mapLimit(botRequests, 8, async ({ userAgent, accept, route }) => {
      try {
        const url = expectedLiveUrl(route);
        const { response, body } = await fetchText(url, {
          headers: { accept, "user-agent": userAgent },
        });
        if (!response.ok || body.length < 100) botProblems.push(`${userAgent} (${accept}, ${route}): HTTP ${response.status} or empty body`);
        if (accept === "text/html" && !/<h1\b/i.test(body)) botProblems.push(`${userAgent} (${accept}, ${route}): no H1`);
        const contentType = response.headers.get("content-type") ?? "";
        const xRobotsNoindex = /\bnoindex\b/i.test(response.headers.get("x-robots-tag") ?? "");
        if (xRobotsNoindex) {
          const finding = `${userAgent} (${accept}, ${route}, ${contentType || "unknown content type"}): X-Robots-Tag noindex`;
          if (contentType.includes("text/html")) botProblems.push(finding);
          else botIndexingWarnings.push(finding);
        }
        if (contentType.includes("text/html") && metaRobotsFromHtml(body, userAgent).includes("noindex")) {
          botProblems.push(`${userAgent} (${accept}, ${route}): meta robots noindex`);
        }
      } catch (error) {
        botProblems.push(`${userAgent} (${accept}, ${route}): ${error.message}`);
      }
  });
  if (botProblems.length) fail("Crawler user-agent access", botProblems);
  else pass("Crawler user-agent access", `${crawlerUserAgents.length} crawlers can fetch HTML and wildcard representations across ${crawlerProbeRoutes.length} route sections`);
  if (botIndexingWarnings.length) {
    warn("Crawler Markdown indexing policy", botIndexingWarnings);
  } else {
    pass("Crawler Markdown indexing policy", "no audited representation asks crawlers not to index it");
  }
}

const counts = {
  pass: results.filter((result) => result.status === "pass").length,
  warn: results.filter((result) => result.status === "warn").length,
  fail: results.filter((result) => result.status === "fail").length,
};
const report = {
  generatedAt: new Date().toISOString(),
  mode: liveMode ? "source-and-live" : "source",
  sourcePageCount: sourceRoutes.length,
  counts,
  results,
};

if (outputPath) {
  const absoluteOutputPath = path.resolve(root, outputPath);
  await mkdir(path.dirname(absoluteOutputPath), { recursive: true });
  await writeFile(absoluteOutputPath, `${JSON.stringify(report, null, 2)}\n`);
}

for (const result of results) {
  const marker = result.status === "pass" ? "PASS" : result.status === "warn" ? "WARN" : "FAIL";
  console.log(`[${marker}] ${result.name}`);
  if (result.status !== "pass") console.log(JSON.stringify(result.details, null, 2));
}
console.log(`\nAEO audit: ${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed.`);

if (process.env.GITHUB_STEP_SUMMARY) {
  const summary = [
    "## Looksy docs AEO audit",
    "",
    `Mode: **${report.mode}**`,
    `Result: **${counts.pass} passed, ${counts.warn} warnings, ${counts.fail} failed**`,
    "",
    "| Status | Check |",
    "| --- | --- |",
    ...results.map((result) => `| ${result.status.toUpperCase()} | ${result.name} |`),
    "",
  ].join("\n");
  await writeFile(process.env.GITHUB_STEP_SUMMARY, summary, { flag: "a" });
}

if (counts.fail) process.exitCode = 1;
