# vcpkg CMake Feature Selector

Select optional vcpkg manifest features for a CMake-based workspace directly from VS Code.

vcpkg Feature Selector reads the available features from the workspace root `vcpkg.json`, persists the active selection in extension-owned workspace state, and exposes it to CMake Tools through command substitution.

## Requirements

This extension requires:

- Visual Studio Code
- the Microsoft CMake Tools extension
- a workspace root `vcpkg.json`
- a CMake project using vcpkg manifest mode
- a CMake project that accepts the cache variable `BUILD_VCPKG_FEATURES`

The extension does not install or configure vcpkg itself.

## What It Does

The extension provides a status bar entry and a command palette action:

```text
vcpkg: Select Manifest Features
```

It reads the available features directly from the workspace root `vcpkg.json`.

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

The selector shows the available feature names together with their descriptions.

## Selecting Features

Multiple features can be selected.

For example, selecting:

```text
gui
tests
```

results in:

```text
-DBUILD_VCPKG_FEATURES=gui;tests
```

The extension normalizes selections by:

- removing empty entries
- removing the special `none` value
- removing duplicates
- sorting the selected feature names

## `none`

The selector provides a virtual feature:

```text
none
```

It means that no optional vcpkg manifest features are explicitly selected.

It is stored as:

```text
-DBUILD_VCPKG_FEATURES=none
```

`none` is not required to exist in `vcpkg.json`.

If `none` is selected together with real features, `none` is ignored.

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
vcpkg Feature Selector
    ↓
cmake.configureArgs
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

## CMake Tools Integration and Persistence

The active feature selection is persisted in extension-owned VS Code `workspaceState` instead of as a literal feature value in `.vscode/settings.json`.

CMake Tools receives the current selection through one stable managed argument:

```json
"cmake.configureArgs": [
  "-DBUILD_VCPKG_FEATURES=${command:vcpkgFeatureSelector.getSelectedFeatures}"
]
```

On first activation, the extension installs this stable integration argument if necessary. Other CMake configure arguments are preserved, and switching features afterward does not rewrite this setting.

The extension is declared as a workspace extension. Independent Remote / Dev Container environments that mount the same source checkout can therefore maintain independent selected feature state instead of racing through a shared literal feature value in `.vscode/settings.json`.

### Migration from 0.1.2 and Earlier

Earlier versions stored a literal value such as:

```text
-DBUILD_VCPKG_FEATURES=gui;tests
```

in `cmake.configureArgs`.

On first activation after upgrading, if no extension-owned state exists yet, that legacy value is retained as the selected feature state and the managed argument is replaced by the stable command-substitution form. Unrelated CMake configure arguments are preserved.

After migration, use the selector or `environmentFeatures` to control the VS Code extension. Terminal and CI builds can continue to pass `-DBUILD_VCPKG_FEATURES=...` directly to CMake.

## Environment-specific Feature Selection

A development environment can define the feature set that should be active when the extension starts:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui"
```

Multiple features can be specified using a CMake-style list:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui;tests"
```

To explicitly select no optional features:

```json
"vcpkgFeatureSelector.environmentFeatures": "none"
```

Leaving the setting empty preserves the persisted extension state:

```json
"vcpkgFeatureSelector.environmentFeatures": ""
```

A non-empty environment selection overrides persisted state during activation and requests a clean configure only when the active value changes. The setting has machine scope, making it suitable for environment-specific configuration such as Dev Containers.

## Configure Behavior

Changing the selected feature set through the selector triggers:

```text
cmake.cleanConfigure
```

A clean configure is used because changing the installed vcpkg feature set can otherwise leave stale CMake package information in the existing build directory.

Selecting the already active feature set does nothing.

Cancelling the selector performs no action.

## Status Bar

The status bar displays the current feature selection.

When no optional features are selected, it shows:

```text
none
```

When optional features are selected, it shows the package icon together with the number of selected features.

The tooltip shows the selected feature names.

### Warning State

If a configured feature no longer exists in `vcpkg.json`, the status bar shows a warning.

The extension does not silently remove the missing feature from the active selection.

### Error State

The extension shows an error state when it cannot operate correctly, for example when:

- no workspace root `vcpkg.json` exists
- `vcpkg.json` cannot be read or parsed
- the workspace folder cannot be determined
- CMake Tools is not installed
- more than one root manifest is found in a multi-root workspace

## Multi-root Workspaces

The extension currently supports exactly one root `vcpkg.json`.

A multi-root workspace is supported only when exactly one workspace folder contains a root manifest.

When multiple root manifests are detected, the extension enters an error state instead of choosing one implicitly.

## Command-line / CI Builds

The extension is only a VS Code convenience layer. Terminal and CI builds do not depend on extension state and can configure directly:

```bash
cmake --preset <preset-name> \
    -DBUILD_VCPKG_FEATURES='gui;tests'
```

## Limitations

The following are currently not handled:

- multiple root `vcpkg.json` manifests
- dynamic rescanning when workspace folders are added or removed after extension activation
- automatic correction of stale CMake package-cache state caused by manual changes to `vcpkg.json`
- external manual changes to literal `BUILD_VCPKG_FEATURES` configure arguments after migration

## License

vcpkg Feature Selector is distributed under the Boost Software License 1.0.

See `LICENSE` for the full license text.
