import { describe, expect, test } from "bun:test"
import { McpOAuth } from "@opencode/core/mcp/oauth"

// What the popular registry servers answered in the live audit of 2026-11-15
// (packages/server/script/audit-mcp-signin.ts), reduced to what the classifier reads.
const registers = { status: 401, metadata: { registration_endpoint: "https://auth.example/register" } }
const cimd = { status: 401, metadata: { client_id_metadata_document_supported: true } }
const appOnly = { status: 401, metadata: {} }
const open = { status: 200 }
const refused = { status: 401 }

const audit: [string, McpOAuth.SignInObservation, McpOAuth.SignInKind][] = [
  ...[
    "Notion",
    "Linear",
    "Atlassian",
    "Figma",
    "Sentry",
    "Stripe",
    "Supabase",
    "Vercel",
    "GitLab",
    "Zapier",
    "Make",
  ].map((name) => [name, registers, "browser"] as [string, McpOAuth.SignInObservation, McpOAuth.SignInKind]),
  ...[
    "Hugging Face",
    "Canva",
    "Airtable",
    "monday",
    "PayPal",
    "Webflow",
    "Wix",
    "Postman",
    "PostHog",
    "Grafana",
    "Prisma",
    "Apify",
  ].map((name) => [name, registers, "browser"] as [string, McpOAuth.SignInObservation, McpOAuth.SignInKind]),
  ["A server with only a client ID metadata document", cimd, "browser"],
  ...["Context7", "Firecrawl", "Microsoft Learn", "Wolfram", "Cloudflare", "Exa"].map(
    (name) => [name, open, "open"] as [string, McpOAuth.SignInObservation, McpOAuth.SignInKind],
  ),
  ["GitHub", appOnly, "app"],
  // ElevenLabs needed a registered app in the first audit and now registers clients, as audit-mcp-signin.ts shows.
  ["ElevenLabs", registers, "browser"],
  ["A server that refuses without OAuth", refused, "key"],
  ["A server that refuses with 403", { status: 403 }, "key"],
  ["A server that fails an initialize without settings", { status: 400 }, "key"],
]

describe("classifySignIn", () => {
  test.each(audit)("%s", (_, observation, expected) => {
    expect(McpOAuth.classifySignIn(observation)).toBe(expected)
  })
})
