# vcpkg CMake Feature Selector

A small VS Code extension for selecting optional vcpkg manifest features used by a CMake-based workspace.

The extension reads the available features directly from the workspace root `vcpkg.json`, stores the active selection in extension-owned workspace state, and exposes it to CMake Tools through command substitution.

The extension intentionally uses the project-facing CMake cache variable `BUILD_VCPKG_FEATURES`. The consuming CMake project maps that value to vcpkg's `VCPKG_MANIFEST_FEATURES` before `project()` is called.

## Installation

### Visual Studio Marketplace

The extension is available on the Visual Studio Marketplace:

[vcpkg CMake Feature Selector](https://marketplace.visualstudio.com/items?itemName=TheRealShoxie.vcpkg-cmake-feature-selector)

It can also be installed directly from the Extensions view in VS Code by searching for:

```text
vcpkg CMake Feature Selector
```

### VSIX

A packaged release can also be installed from a `.vsix` file.

From VS Code:

```text
Extensions
→ Views and More Actions...
→ Install from VSIX...
```

Or from the command line:

```bash
code --install-extension vcpkg-cmake-feature-selector-<version>.vsix
```

## Requirements

The extension requires:

- Visual Studio Code
- the Microsoft CMake Tools extension
- a workspace root `vcpkg.json`
- a CMake project using vcpkg manifest mode
- a CMake project that accepts the cache variable `BUILD_VCPKG_FEATURES`

The extension does not install or configure vcpkg itself.

## Feature Discovery

Available features are read dynamically from the workspace root `vcpkg.json`.

For example:

```json
{
  "features": {
    "gui": {
      "description": "Enable optional Dear ImGui support",
      "dependencies": [
        "imgui"
      ]
    }
  }
}
```

The selector will show the feature name together with its description:

```text
gui    Enable optional Dear ImGui support
```

Feature names do not need to be duplicated inside the extension.

If a feature does not define a `description`, it is still shown normally.

## Selecting Features

The selector is available through the package icon in the VS Code status bar or through the VS Code Command Palette:

```text
vcpkg: Select Manifest Features
```

Multiple features can be selected.

For example:

```text
gui
tests
```

is exposed to CMake Tools as:

```text
-DBUILD_VCPKG_FEATURES=gui;tests
```

Feature selections are normalized by:

- removing empty entries
- removing the special `none` value
- removing duplicates
- sorting the selected feature names

## `none`

The selector provides a virtual feature called:

```text
none
```

It means that no optional vcpkg manifest features are explicitly selected through the extension.

It is exposed to CMake Tools as:

```text
-DBUILD_VCPKG_FEATURES=none
```

`none` is not required to exist as a feature in `vcpkg.json`.

If `none` is selected together with real features, `none` is ignored.

For example:

```text
none
gui
```

results in:

```text
-DBUILD_VCPKG_FEATURES=gui
```

The `none` value does not disable vcpkg manifest default features.

Projects that also want to disable their manifest default features must configure `VCPKG_MANIFEST_NO_DEFAULT_FEATURES` separately.

## CMake Integration

The extension deliberately manages the project-facing cache variable:

```text
BUILD_VCPKG_FEATURES
```

It does not directly set vcpkg's:

```text
VCPKG_MANIFEST_FEATURES
```

The intended integration is:

```text
VS Code
    ↓
vcpkg Feature Selector workspace state
    ↓
vcpkgFeatureSelector.getSelectedFeatures
    ↓
cmake.configureArgs command substitution
    ↓
BUILD_VCPKG_FEATURES
    ↓
CMake project integration
    ↓
VCPKG_MANIFEST_FEATURES
    ↓
vcpkg manifest installation
```

The consuming CMake project must map `BUILD_VCPKG_FEATURES` to `VCPKG_MANIFEST_FEATURES` before the first call to `project()`.

For example:

```cmake
cmake_minimum_required(VERSION 3.21)

set(
    BUILD_VCPKG_FEATURES
    "none"
    CACHE STRING
    "Semicolon-separated vcpkg manifest features"
)

set(
    _vcpkg_manifest_features
    ${BUILD_VCPKG_FEATURES}
)

list(
    REMOVE_ITEM
    _vcpkg_manifest_features
    ""
    "none"
)

set(
    VCPKG_MANIFEST_FEATURES
    "${_vcpkg_manifest_features}"
)

unset(_vcpkg_manifest_features)

project(
    my_project
    LANGUAGES CXX
)
```

The virtual `none` value is removed before the selection is forwarded to vcpkg.

For example:

```text
BUILD_VCPKG_FEATURES=none
```

results in an empty:

```text
VCPKG_MANIFEST_FEATURES
```

while:

```text
BUILD_VCPKG_FEATURES=gui
```

results in:

```text
VCPKG_MANIFEST_FEATURES=gui
```

### CMake Tools Integration and Persistence

The active feature selection is persisted in extension-owned VS Code `workspaceState` instead of as a literal feature value in `.vscode/settings.json`.

CMake Tools receives the selection through one stable managed argument:

```json
"cmake.configureArgs": [
  "-DBUILD_VCPKG_FEATURES=${command:vcpkgFeatureSelector.getSelectedFeatures}"
]
```

On first activation, the extension installs this stable integration argument if it is not already present. After that, changing the selected features updates only extension-owned state and does not rewrite `cmake.configureArgs`.

The extension manages only arguments beginning with:

```text
-DBUILD_VCPKG_FEATURES=
```

Other CMake configure arguments are preserved.

For example:

```json
"cmake.configureArgs": [
  "-DSOME_OPTION=ON",
  "-DBUILD_VCPKG_FEATURES=${command:vcpkgFeatureSelector.getSelectedFeatures}"
]
```

remains unchanged when a different feature set is selected. CMake Tools evaluates the command substitution during configure and receives the current feature value from the extension.

The internal command:

```text
vcpkgFeatureSelector.getSelectedFeatures
```

returns `none` or the normalized semicolon-separated feature list. It is hidden from the Command Palette.

The persisted workspace state survives closing and reopening the same workspace when `vcpkgFeatureSelector.environmentFeatures` is empty.

The extension is declared as a workspace extension. In Remote / Dev Container scenarios it therefore runs in the workspace extension host, allowing independent remote environments that mount the same source checkout to keep independent selected feature state without rewriting a shared `.vscode/settings.json` on every selection change.

#### Migration from 0.1.2 and Earlier

Earlier releases persisted a literal feature value directly in `cmake.configureArgs`, for example:

```json
"cmake.configureArgs": [
  "-DSOME_OPTION=ON",
  "-DBUILD_VCPKG_FEATURES=gui;tests"
]
```

On first activation after upgrading, if no extension-owned feature state exists yet, the extension uses the last legacy literal `BUILD_VCPKG_FEATURES` value as the persisted selection and replaces all managed literal feature arguments with the stable command-substitution argument.

The example above becomes:

```json
"cmake.configureArgs": [
  "-DSOME_OPTION=ON",
  "-DBUILD_VCPKG_FEATURES=${command:vcpkgFeatureSelector.getSelectedFeatures}"
]
```

The effective selection remains `gui;tests`, and unrelated configure arguments are preserved.

After migration, external changes to literal `-DBUILD_VCPKG_FEATURES=...` entries are no longer treated as another source of truth. Use the selector, `environmentFeatures`, or pass `-DBUILD_VCPKG_FEATURES` directly when configuring outside VS Code.

## Environment-specific Feature Selection

A development environment can define the feature set that should be active when the extension starts.

This is configured through:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui"
```

For example, a VS Code Dev Container can define:

```json
"customizations": {
  "vscode": {
    "settings": {
      "vcpkgFeatureSelector.environmentFeatures": "gui"
    }
  }
}
```

Multiple features can be specified using a CMake-style list:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui;tests"
```

To explicitly select no optional features, use:

```json
"vcpkgFeatureSelector.environmentFeatures": "none"
```

Leaving the setting empty means that the environment does not override the persisted extension state:

```json
"vcpkgFeatureSelector.environmentFeatures": ""
```

The setting has machine scope, which makes it suitable for environment-specific configuration such as Dev Containers.

When a non-empty environment feature selection is configured, it is applied during extension activation. If it differs from the previously persisted selection, the extension saves the environment selection and requests one clean CMake configure.

If it is already equal, no additional clean configure is requested.

Because the environment selection is applied when the extension starts, reloading or reopening the VS Code window restores the feature set declared by the environment. An empty environment selection instead preserves the previously persisted interactive selection.

## Configure Behavior

Changing the selected feature set through the selector triggers:

```text
cmake.cleanConfigure
```

A clean configure is used because changing the installed vcpkg feature set can otherwise leave stale CMake package information in the existing build directory.

Selecting the already active feature set does nothing and does not trigger another configure.

Cancelling the selector also performs no action.

Changing `vcpkg.json` itself does not cause this extension to request a clean configure.

CMake Tools or CMake may independently decide to configure after project files change.

## Manifest Watching

The extension watches the workspace root:

```text
vcpkg.json
```

while VS Code is running.

Changes to the manifest automatically refresh:

- available feature names
- feature descriptions
- status information

Restarting the extension is therefore not required after editing feature definitions.

The manifest watcher does not modify the selected feature state.

## Status Bar

The status bar displays the current feature selection.

When no optional features are selected, it displays the package icon together with:

```text
none
```

When optional features are selected, it displays the package icon together with the number of selected features.

For example:

```text
📦 2
```

indicates that two optional features are selected.

The tooltip shows the selected feature names.

### Warning State

If a configured feature no longer exists in `vcpkg.json`, the status bar shows a warning.

The extension does not silently remove the missing feature from the active selection.

The selection changes only after the user explicitly selects a new feature set.

### Error State

The extension shows an error state when it cannot operate correctly, for example when:

- no workspace root `vcpkg.json` exists
- `vcpkg.json` cannot be read or parsed
- the workspace folder cannot be determined
- CMake Tools is not installed
- more than one root manifest is found in a multi-root workspace

Errors caused directly by a user selection, such as failing to persist the selected features or failing to invoke the CMake clean-configure command, are also shown as VS Code error notifications.

## Multi-root Workspaces

The extension currently supports exactly one root `vcpkg.json`.

A multi-root workspace is supported only when exactly one workspace folder contains a root manifest.

For example, this is supported:

```text
workspace
├── project/
│   └── vcpkg.json
│
└── documentation/
```

This is currently not supported:

```text
workspace
├── project-a/
│   └── vcpkg.json
│
└── project-b/
    └── vcpkg.json
```

When multiple root manifests are detected, the extension enters an error state instead of choosing one implicitly.

## Command-line Builds

The extension is only a VS Code user interface for selecting the CMake cache value.

It is not required for command-line builds.

The same configuration can be supplied directly to CMake:

```bash
cmake --preset <preset-name> \
    -DBUILD_VCPKG_FEATURES=gui
```

Multiple features use a CMake list:

```bash
cmake --preset <preset-name> \
    -DBUILD_VCPKG_FEATURES='gui;tests'
```

No optional features can be explicitly selected with:

```bash
cmake --preset <preset-name> \
    -DBUILD_VCPKG_FEATURES=none
```

When changing feature sets manually from the command line, a fresh configure may be required to avoid stale package information.

## Example Project

The repository contains a small standalone example under:

```text
example/
```

Its manifest contains one optional feature:

```text
gui
```

which adds Dear ImGui as an optional dependency.

The example demonstrates the complete integration:

```text
Feature selection
    ↓
BUILD_VCPKG_FEATURES
    ↓
VCPKG_MANIFEST_FEATURES
    ↓
optional ImGui dependency
```

With:

```text
BUILD_VCPKG_FEATURES=none
```

the example builds without the optional GUI dependency.

With:

```text
BUILD_VCPKG_FEATURES=gui
```

the `gui` manifest feature is selected and Dear ImGui is available to the CMake project.

## Development

The extension is implemented in JavaScript and does not require a TypeScript build step for development. Automated tests use Node.js' built-in test runner and have no third-party test-framework dependency.

The repository contains the standalone example project used by the Extension Development Host:

```text
vcpkg-feature-selector/
├── .vscode/
│   └── launch.json
├── example/
│   ├── CMakeLists.txt
│   ├── CMakePresets.json
│   ├── main.cpp
│   └── vcpkg.json
├── src/
│   ├── extension.js
│   └── featureState.js
├── test/
│   ├── extension.test.js
│   └── featureState.test.js
├── CHANGELOG.md
├── LICENSE
├── package.json
└── README.md
```

### Development and Test Prerequisites

Running the automated extension tests requires:

- Node.js 20 or newer
- npm

Testing the included CMake example additionally requires:

- CMake
- Ninja
- a C++ compiler
- Git
- curl
- zip
- unzip
- tar
- pkg-config
- vcpkg
- Visual Studio Code
- the Microsoft CMake Tools extension

On Ubuntu or WSL Ubuntu, the required packages can be installed with:

```bash
sudo apt update

sudo apt install -y \
    build-essential \
    cmake \
    ninja-build \
    git \
    curl \
    zip \
    unzip \
    tar \
    pkg-config \
    autoconf \
    autoconf-archive \
    automake \
    libtool
```

Install vcpkg:

```bash
cd ~

git clone https://github.com/microsoft/vcpkg.git

cd vcpkg

./bootstrap-vcpkg.sh
```

For the example project, either make `VCPKG_ROOT` available in your environment:

```bash
export VCPKG_ROOT="$HOME/vcpkg"
```

or create a local user preset as shown below.

### Automated Extension Tests

Run the dependency-free regression tests with:

```bash
npm test
```

Run syntax checks with:

```bash
npm run test:syntax
```

Run the complete automated suite with:

```bash
npm run test:all
```

The tests cover normalization, `none` handling, legacy migration, preservation of unrelated CMake arguments, environment/persisted-state precedence, clean-configure behavior, manifest refresh behavior, internal command availability, and independent selection state for two extension contexts sharing the same CMake settings.

The VS Code Extension Development Host launch configuration uses `npm run test:all` as a pre-launch task, so pressing `F5` starts the development host only after the automated regression suite passes.

GitHub Actions runs the same regression suite on Node.js 20 and 22 for pushes and pull requests. No dependency installation is required for the test suite.

### Testing the Example from the Command Line

From the repository:

```bash
cd example
```

Test without optional features:

```bash
cmake --fresh \
    --preset default \
    -DBUILD_VCPKG_FEATURES=none

cmake --build --preset default

./build/vcpkg-feature-selector-example
```

Expected output:

```text
gui feature disabled
```

Test the `gui` feature:

```bash
cmake --fresh \
    --preset default \
    -DBUILD_VCPKG_FEATURES=gui

cmake --build --preset default

./build/vcpkg-feature-selector-example
```

Expected output:

```text
gui feature enabled, Dear ImGui version ...
```

### Local User Preset for Development

For development setups where `VCPKG_ROOT` should not be exported globally, create a local machine-specific preset file:

```text
example/CMakeUserPresets.json
```

For example:

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "local",
      "displayName": "Local",
      "inherits": "default",
      "toolchainFile": "/home/<user>/vcpkg/scripts/buildsystems/vcpkg.cmake"
    }
  ],
  "buildPresets": [
    {
      "name": "local",
      "configurePreset": "local"
    }
  ]
}
```

This file should remain untracked.

### Testing the Extension

Open the repository in VS Code.

When using WSL or a Dev Container, make sure the Microsoft CMake Tools extension is installed in the same workspace environment as the extension under development.

Press `F5`.

The automated regression suite runs first. If it passes, the Extension Development Host opens the repository's `example` workspace.

If you use a local user preset, select the `local` configure preset:

```text
Ctrl+Shift+P
→ CMake: Select Configure Preset
→ Local
```

Then test the extension:

1. Configure the example project.
2. Use the status bar entry or Command Palette command:
   ```text
   vcpkg: Select Manifest Features
   ```
3. Select `gui`.
4. Verify CMake clean-configures with:
   ```text
   BUILD_VCPKG_FEATURES=gui
   ```
5. Verify the managed CMake Tools argument remains:
   ```text
   -DBUILD_VCPKG_FEATURES=${command:vcpkgFeatureSelector.getSelectedFeatures}
   ```
6. Build the example and verify that Dear ImGui is enabled.
7. Switch back to `none` and verify another clean configure with `BUILD_VCPKG_FEATURES=none`.
8. Select the already active value and verify no additional clean configure is requested.
9. Change a feature description in `example/vcpkg.json` and verify the selector refreshes without changing the active selection or requesting a clean configure.
10. Remove the active feature from the manifest and verify the warning state; restore it and verify the warning clears.

For Remote / Dev Container isolation, also test the same source checkout from two independent environments with different `vcpkgFeatureSelector.environmentFeatures` values. Changing the selection in environment A must not change environment B's selection or rewrite the shared feature value in `.vscode/settings.json`.

### Creating a VSIX

The extension can be packaged with Microsoft's `vsce` tool.

Run the complete regression suite before packaging:

```bash
npm run test:all
```

Because the repository uses a separate README for the Visual Studio Marketplace, package the extension with:

```bash
npm run package:vsix
```

The command creates a file named similar to:

```text
vcpkg-cmake-feature-selector-<version>.vsix
```

The resulting package can be installed with:

```bash
code --install-extension vcpkg-cmake-feature-selector-<version>.vsix
```

## Current Limitations

The following are currently not handled:

- multiple root `vcpkg.json` manifests
- dynamic rescanning when workspace folders are added or removed after extension activation
- automatic correction of stale CMake package-cache state caused by manual changes to `vcpkg.json`
- external manual changes to literal `BUILD_VCPKG_FEATURES` configure arguments after migration

## License

vcpkg Feature Selector is distributed under the Boost Software License 1.0.

See `LICENSE` for the full license text.
