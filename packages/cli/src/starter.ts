import { createHash } from 'node:crypto';
import {
  AssetsManifestSchema,
  DEMO_CONFIG_SCHEMA_URL,
  DemoSchema,
  generateDemoId,
} from '@inkly-org/interactive-demo/schema';
import { PROJECT_FILE, PROJECT_SCHEMA_URL, ProjectSchema } from './project.js';

/**
 * Project skeleton — the starter file set every brand-new project begins
 * with, plus the starter demo `init --demo` scaffolds. The single source of
 * truth for what a fresh project looks like lives in this file.
 */

export const STARTER_SLUG = 'getting-started';
export const DEFAULT_THEME_ID = 'mono';

export interface SkeletonFile {
  /** Forward-slash path relative to the project root. */
  path: string;
  contents: string;
}

/** Convert a kebab-case slug into a human-readable Title Case title. */
export function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const DEFAULT_DEMO_THEME = {
  tokens: {
    primary: '#5b6cff',
    secondary: '#ebebeb',
    font: 'ui-sans-serif, system-ui, sans-serif',
    radius: '10px',
  },
} as const;

const DEFAULT_DEMO_CHROME = {
  hideHeader: false,
  hideControls: false,
  controls: 'full',
  mobileFooterMessage: true,
  autoplay: false,
} as const;

/** Asset id / file name for the starter's placeholder shot. */
export const PLACEHOLDER_ASSET_ID = 'placeholder-shot';
export const PLACEHOLDER_FILE = 'placeholder.svg';
const PLACEHOLDER_WIDTH = 1920;
const PLACEHOLDER_HEIGHT = 1080;

/**
 * The placeholder screenshot bytes for a scaffolded demo. A self-contained
 * 16:9 SVG (no external refs) written to the demo's assets folder so the
 * content step renders something the moment it's added. The author swaps it
 * for a real capture.
 */
export function placeholderSvg(): string {
  const w = PLACEHOLDER_WIDTH;
  const h = PLACEHOLDER_HEIGHT;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#ffffff"/>
      <stop offset="100%" stop-color="#eef0f6"/>
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)"/>
  <rect x="60" y="60" width="${w - 120}" height="${h - 120}" rx="28" fill="none" stroke="#c7ccdb" stroke-width="3" stroke-dasharray="14 14"/>
  <text x="50%" y="47%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="84" font-weight="600" fill="#1f2937">Your screenshot goes here</text>
  <text x="50%" y="56%" text-anchor="middle" dominant-baseline="middle" font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif" font-size="38" fill="#6b7280">Replace assets/${PLACEHOLDER_FILE} with a capture of your product</text>
</svg>`;
}

/**
 * `assets.json` for a scaffolded demo — one local placeholder image keyed by
 * its content hash. The caller computes `sha256`/`size` from the bytes
 * returned by {@link placeholderSvg}.
 */
export function starterAssetsManifest(input: { sha256: string; size?: number }): unknown {
  return {
    version: 1,
    assets: [
      {
        id: PLACEHOLDER_ASSET_ID,
        sha256: input.sha256,
        kind: 'image',
        contentType: 'image/svg+xml',
        file: PLACEHOLDER_FILE,
        ...(typeof input.size === 'number' ? { size: input.size } : {}),
        viewport: { w: PLACEHOLDER_WIDTH, h: PLACEHOLDER_HEIGHT },
      },
    ],
  };
}

/**
 * Starter demo: a three-step shell — an intro cover, one content step on the
 * placeholder screenshot, and an outro cover — ready to be filled with a real
 * capture. A fresh, opaque `id` is minted via `generateDemoId()`; a demo's
 * identity is permanent and independent of its folder slug.
 */
export function starterDemoConfig(slug: string, title?: string): unknown {
  return {
    $schema: DEMO_CONFIG_SCHEMA_URL,
    id: generateDemoId(),
    version: 1,
    title: title ?? titleFromSlug(slug),
    theme: DEFAULT_DEMO_THEME,
    chrome: DEFAULT_DEMO_CHROME,
    chapters: [{ id: 'walkthrough', title: 'Walkthrough', stepIds: ['shot-1'] }],
    steps: [
      {
        kind: 'cover',
        id: 'cover-intro',
        widgets: [
          {
            type: 'headline',
            id: 'headline-intro',
            title: 'Your demo title',
            description:
              'A one-line hook for what this walkthrough shows. Replace this cover with your own.',
            textAlign: 'middle',
            cta: {
              label: 'Start walkthrough',
              action: { type: 'next' },
              animation: 'shimmer',
            },
          },
        ],
        advance: { trigger: 'click' },
      },
      {
        kind: 'content',
        id: 'shot-1',
        background: {
          type: 'image',
          src: `asset:${PLACEHOLDER_ASSET_ID}`,
          naturalWidth: PLACEHOLDER_WIDTH,
          naturalHeight: PLACEHOLDER_HEIGHT,
          alt: 'Placeholder screen — replace with your capture',
          objectFit: 'cover',
        },
        script:
          'Describe what is happening on this screen. Replace the placeholder with a real capture, then add hotspots in the editor.',
        advance: { trigger: 'click' },
        annotations: [],
      },
      {
        kind: 'cover',
        id: 'cover-outro',
        widgets: [
          {
            type: 'headline',
            id: 'headline-outro',
            title: 'Thanks for watching',
            description: 'Add a closing message or a call to action here.',
            textAlign: 'middle',
            cta: {
              label: 'Replay',
              action: { type: 'restart' },
              animation: 'shimmer',
            },
          },
        ],
        advance: { trigger: 'click' },
      },
    ],
  };
}

function projectConfig(name: string, options: { theme?: string } = {}): unknown {
  return {
    $schema: PROJECT_SCHEMA_URL,
    name,
    theme: options.theme ?? DEFAULT_THEME_ID,
    demos: [STARTER_SLUG],
  };
}

const GITIGNORE = `node_modules/
dist/
`;

function projectReadme(name: string): string {
  return `# ${name}

Interactive product demos, built with \`interactive-demo\`.

Each folder under \`demos/\` is one demo: a \`demo.config.json\` describing
the steps, an \`assets.json\` manifest, and the screenshots and recordings
under \`assets/\`. The project itself is configured by \`${PROJECT_FILE}\`.

## Preview and edit

\`\`\`bash
npx interactive-demo dev
\`\`\`

Opens a local preview of every demo, with the editor. Edits are written
straight to the files in this folder.

## Build

\`\`\`bash
npx interactive-demo build
\`\`\`

Writes a self-contained static folder per demo under \`dist/\`. Deploy it
anywhere that serves static files and embed the demo with an iframe.
`;
}

export interface ProjectSkeletonOptions {
  /** Value for the project's `name` and the README heading. */
  name: string;
  /** Optional theme preset id written into the project file. */
  theme?: string;
  /** Skip the starter demo. */
  noStarterDemo?: boolean;
}

/** The starter demo's file set, relative to the demo folder. */
export function starterDemoFiles(slug: string, title?: string): {
  files: SkeletonFile[];
  id: string;
} {
  const svg = placeholderSvg();
  const sha256 = sha256Hex(svg);
  const size = Buffer.byteLength(svg, 'utf8');
  const demoConfig = starterDemoConfig(slug, title);
  const assetsManifest = starterAssetsManifest({ sha256, size });

  const demoParsed = DemoSchema.safeParse(demoConfig);
  if (!demoParsed.success) {
    throw new Error(
      `Internal error: scaffolded demo failed schema validation. ${demoParsed.error.message}`,
    );
  }
  const assetsParsed = AssetsManifestSchema.safeParse(assetsManifest);
  if (!assetsParsed.success) {
    throw new Error(
      `Internal error: scaffolded assets failed schema validation. ${assetsParsed.error.message}`,
    );
  }

  return {
    id: demoParsed.data.id,
    files: [
      { path: 'demo.config.json', contents: JSON.stringify(demoConfig, null, 2) + '\n' },
      { path: 'assets.json', contents: JSON.stringify(assetsManifest, null, 2) + '\n' },
      { path: `assets/${PLACEHOLDER_FILE}`, contents: svg },
    ],
  };
}

/**
 * Render the full starter file set for a new project. Throws if the
 * generated project file or starter demo fails schema validation — that
 * means the schema package and this skeleton have drifted, and the fix is
 * here, not at the caller.
 */
export function getProjectSkeleton(options: ProjectSkeletonOptions): SkeletonFile[] {
  const { name, theme } = options;

  const project = projectConfig(name, { theme });
  const projectParsed = ProjectSchema.safeParse(project);
  if (!projectParsed.success) {
    throw new Error(
      `Internal error: starter ${PROJECT_FILE} failed schema validation. ${projectParsed.error.message}`,
    );
  }

  const files: SkeletonFile[] = [
    { path: 'README.md', contents: projectReadme(name) },
    { path: '.gitignore', contents: GITIGNORE },
  ];

  if (options.noStarterDemo) {
    files.push({
      path: PROJECT_FILE,
      contents: JSON.stringify({ ...(project as object), demos: [] }, null, 2) + '\n',
    });
    return files;
  }

  files.push({ path: PROJECT_FILE, contents: JSON.stringify(project, null, 2) + '\n' });
  for (const file of starterDemoFiles(STARTER_SLUG, 'Getting Started').files) {
    files.push({ path: `demos/${STARTER_SLUG}/${file.path}`, contents: file.contents });
  }
  return files;
}

function sha256Hex(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}
