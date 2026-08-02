/**
 * services/thinkbox/src/detection/signals.ts
 * ---------------------------------------------------------------------------
 * Deterministic detection signals — the extension point for the Detection
 * Engine. Adding a language, framework, or package manager is a data change,
 * not a code change.
 *
 * Each signal maps a file name or glob-like extension to a label. Matches are
 * case-insensitive on filenames and extensions.
 * ---------------------------------------------------------------------------
 */

export interface FileSignal {
  /** One or more exact filenames, e.g. ["package.json"]. */
  files?: string[];
  /** One or more extensions, e.g. [".ts", ".tsx"]. */
  extensions?: string[];
  /** Labels to emit when any signal matches. */
  labels: string[];
}

/** Language detection by extension. */
export const LANGUAGE_SIGNALS: FileSignal[] = [
  { extensions: ['.ts', '.tsx', '.mts', '.cts'], labels: ['typescript'] },
  { extensions: ['.js', '.jsx', '.mjs', '.cjs'], labels: ['javascript'] },
  { extensions: ['.py', '.pyi', '.pyw'], labels: ['python'] },
  { extensions: ['.go'], labels: ['go'] },
  { extensions: ['.rs'], labels: ['rust'] },
  { extensions: ['.rb'], labels: ['ruby'] },
  { extensions: ['.java'], labels: ['java'] },
  { extensions: ['.kt', '.kts'], labels: ['kotlin'] },
  { extensions: ['.swift'], labels: ['swift'] },
  { extensions: ['.php'], labels: ['php'] },
  { extensions: ['.c', '.h'], labels: ['c'] },
  { extensions: ['.cpp', '.cc', '.hpp', '.cxx'], labels: ['cpp'] },
  { extensions: ['.cs'], labels: ['csharp'] },
  { extensions: ['.sh', '.bash', '.zsh'], labels: ['shell'] },
  { extensions: ['.sql'], labels: ['sql'] },
  { extensions: ['.html', '.htm'], labels: ['html'] },
  { extensions: ['.css', '.scss', '.sass', '.less'], labels: ['css'] },
  { extensions: ['.vue'], labels: ['vue'] },
  { extensions: ['.lua'], labels: ['lua'] },
  { extensions: ['.ex', '.exs'], labels: ['elixir'] },
  { extensions: ['.dart'], labels: ['dart'] },
  { extensions: ['.md', '.mdx'], labels: ['markdown'] },
  { extensions: ['.json'], labels: ['json'] },
  { extensions: ['.yaml', '.yml'], labels: ['yaml'] },
  { extensions: ['.toml'], labels: ['toml'] },
];

/** Framework/package-manager/build-system detection by exact filename. */
export const FRAMEWORK_SIGNALS: FileSignal[] = [
  { files: ['react-app-env.d.ts', 'next.config.js', 'next.config.mjs', 'next.config.ts'], labels: ['next.js'] },
  { files: ['vite.config.ts', 'vite.config.js', 'vite.config.mjs'], labels: ['vite'] },
  { files: ['astro.config.mjs', 'astro.config.js', 'astro.config.ts'], labels: ['astro'] },
  { files: ['nuxt.config.ts', 'nuxt.config.js', 'nuxt.config.mjs'], labels: ['nuxt'] },
  { files: ['svelte.config.js', 'svelte.config.mjs', 'svelte.config.ts'], labels: ['svelte'] },
  { files: ['angular.json'], labels: ['angular'] },
  { files: ['vue.config.js', 'vue.config.ts'], labels: ['vue'] },
  { files: ['remix.config.js', 'remix.config.mjs', 'remix.config.ts'], labels: ['remix'] },
  { files: ['gatsby-config.js', 'gatsby-config.ts', 'gatsby-config.mjs'], labels: ['gatsby'] },
  { files: ['package.json'], labels: ['node.js'] },
  { files: ['pyproject.toml'], labels: ['python'] },
  { files: ['requirements.txt'], labels: ['python'] },
  { files: ['setup.py', 'setup.cfg'], labels: ['python'] },
  { files: ['go.mod'], labels: ['go'] },
  { files: ['Cargo.toml'], labels: ['cargo'] },
  { files: ['Gemfile'], labels: ['ruby'] },
  { files: ['pom.xml', 'build.gradle', 'build.gradle.kts', 'settings.gradle'], labels: ['jvm'] },
  { files: ['composer.json'], labels: ['php'] },
  { files: ['mix.exs'], labels: ['elixir'] },
  { files: ['pubspec.yaml'], labels: ['dart'] },
  { files: ['Package.swift'], labels: ['swift'] },
  { files: ['_config.yml', 'Gemfile.lock'], labels: ['jekyll'] },
];

/** Package manager detection by lockfile / manifest presence. */
export const PACKAGE_MANAGER_SIGNALS: FileSignal[] = [
  { files: ['package-lock.json', 'npm-shrinkwrap.json'], labels: ['npm'] },
  { files: ['bun.lock', 'bun.lockb'], labels: ['bun'] },
  { files: ['yarn.lock'], labels: ['yarn'] },
  { files: ['pnpm-lock.yaml'], labels: ['pnpm'] },
  { files: ['poetry.lock'], labels: ['poetry'] },
  { files: ['uv.lock', 'Pipfile.lock'], labels: ['pip'] },
  { files: ['requirements.txt', 'setup.py', 'pyproject.toml'], labels: ['pip'] },
  { files: ['go.sum'], labels: ['go modules'] },
  { files: ['Cargo.lock'], labels: ['cargo'] },
  { files: ['Gemfile.lock'], labels: ['bundler'] },
  { files: ['composer.lock'], labels: ['composer'] },
  { files: ['pubspec.lock'], labels: ['pub'] },
];

/** Build system detection by configuration file presence. */
export const BUILD_SYSTEM_SIGNALS: FileSignal[] = [
  { files: ['turbo.json', 'nx.json'], labels: ['turbo'] },
  { files: ['lerna.json'], labels: ['lerna'] },
  { files: ['Makefile', 'makefile', 'GNUmakefile'], labels: ['make'] },
  { files: ['CMakeLists.txt'], labels: ['cmake'] },
  { files: ['Meson.build', 'meson.build'], labels: ['meson'] },
  { files: ['bazel.BUILD', 'BUILD.bazel', 'WORKSPACE'], labels: ['bazel'] },
  { files: ['justfile', 'justfile.toml'], labels: ['just'] },
  { files: ['gradlew', 'gradlew.bat'], labels: ['gradle'] },
  { files: ['pants.toml', 'pants.ini'], labels: ['pants'] },
  { files: ['Taskfile.yml', 'Taskfile.yaml'], labels: ['task'] },
  { files: ['cargo.toml'], labels: ['cargo'] },
  { files: ['Rakefile'], labels: ['rake'] },
];

/** Monorepo indicator detection. */
export const MONOREPO_SIGNALS: FileSignal[] = [
  { files: ['turbo.json', 'nx.json', 'lerna.json'], labels: ['task-runner'] },
  { files: ['pnpm-workspace.yaml', 'pnpm-workspace.yml'], labels: ['pnpm-workspace'] },
  { files: ['.npmrc'], labels: ['npmrc'] },
  { files: ['rush.json'], labels: ['rush'] },
];

/** CI configuration detection. */
export const CI_SIGNALS: FileSignal[] = [
  { files: ['.github/workflows/ci.yml', '.github/workflows/ci.yaml', '.github/workflows/test.yml', '.github/workflows/verify.yml'], labels: ['github-actions'] },
  { files: ['.gitlab-ci.yml', '.gitlab-ci.yaml'], labels: ['gitlab-ci'] },
  { files: ['Jenkinsfile'], labels: ['jenkins'] },
  { files: ['.circleci/config.yml', '.circleci/config.yaml'], labels: ['circleci'] },
  { files: ['azure-pipelines.yml', 'azure-pipelines.yaml'], labels: ['azure-pipelines'] },
  { files: ['bitbucket-pipelines.yml'], labels: ['bitbucket-pipelines'] },
  { files: ['.travis.yml'], labels: ['travis'] },
  { files: ['buildkite.yml', 'buildkite.yaml', '.buildkite/pipeline.yml'], labels: ['buildkite'] },
  { files: ['drone.yml', 'drone.yaml'], labels: ['drone'] },
  { files: ['.woodpecker.yml', '.woodpecker.yaml'], labels: ['woodpecker'] },
  { files: ['appveyor.yml'], labels: ['appveyor'] },
];

/** Docker / containerization detection. */
export const DOCKER_SIGNALS: FileSignal[] = [
  { files: ['Dockerfile', 'dockerfile', 'Dockerfile.dev', 'Dockerfile.prod'], labels: ['dockerfile'] },
  { files: ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml'], labels: ['docker-compose'] },
  { files: ['Containerfile'], labels: ['containerfile'] },
];

/** Documentation detection. */
export const DOCUMENTATION_SIGNALS: FileSignal[] = [
  { files: ['README.md', 'readme.md', 'Readme.md', 'README.rst', 'README.txt', 'README'], labels: ['readme'] },
  { files: ['CONTRIBUTING.md', 'CONTRIBUTING.rst'], labels: ['contributing'] },
  { files: ['CHANGELOG.md', 'CHANGELOG'], labels: ['changelog'] },
  { files: ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'COPYING'], labels: ['license'] },
  { files: ['docs/', 'doc/', 'documentation/', 'wiki/'], labels: ['docs-dir'] },
];

/** Entry-point files (primary language entry candidates). */
export const ENTRYPOINT_SIGNALS: FileSignal[] = [
  { files: ['package.json'], labels: ['package.json'] },
  { files: ['src/index.ts', 'src/index.tsx', 'index.ts', 'index.tsx'], labels: ['typescript-entry'] },
  { files: ['src/index.js', 'src/index.jsx', 'index.js', 'index.jsx', 'app.js', 'app.jsx'], labels: ['javascript-entry'] },
  { files: ['main.py', 'app.py', 'manage.py', 'wsgi.py', 'asgi.py'], labels: ['python-entry'] },
  { files: ['main.go', 'cmd/main.go'], labels: ['go-entry'] },
  { files: ['main.rs', 'src/main.rs'], labels: ['rust-entry'] },
  { files: ['app.rb', 'config.ru', 'Gemfile'], labels: ['ruby-entry'] },
  { files: ['serverless.yml', 'serverless.yaml'], labels: ['serverless-entry'] },
];
