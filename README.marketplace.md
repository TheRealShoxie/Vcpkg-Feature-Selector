# vcpkg Feature Selector

Select optional vcpkg manifest features for a CMake-based workspace directly from VS Code.

vcpkg Feature Selector reads the available features from the workspace root `vcpkg.json` and stores the selected feature set through CMake Tools in `cmake.configureArgs`.

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

## CMake Tools Persistence

The selected feature set is persisted through:

```json
"cmake.configureArgs": [
  "-DBUILD_VCPKG_FEATURES=gui"
]
```

The extension manages only arguments beginning with:

```text
-DBUILD_VCPKG_FEATURES=
```

Other CMake configure arguments are preserved.

For example:

```json
"cmake.configureArgs": [
  "-DSOME_OPTION=ON",
  "-DBUILD_VCPKG_FEATURES=none"
]
```

becomes:

```json
"cmake.configureArgs": [
  "-DSOME_OPTION=ON",
  "-DBUILD_VCPKG_FEATURES=gui"
]
```

when `gui` is selected.

## Environment-specific Feature Selection

A development environment can define the feature set that should be active when the extension starts.

This is configured through:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui"
```

Multiple features can be specified using a CMake-style list:

```json
"vcpkgFeatureSelector.environmentFeatures": "gui;tests"
```

To explicitly select no optional features, use:

```json
"vcpkgFeatureSelector.environmentFeatures": "none"
```

Leaving the setting empty means that the environment does not override the persisted feature selection:

```json
"vcpkgFeatureSelector.environmentFeatures": ""
```

When a non-empty environment feature selection is configured, the extension updates the managed `-DBUILD_VCPKG_FEATURES=...` entry and requests a clean configure only when the configured value differs from the persisted selection.

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

The extension does not silently remove the missing feature from the CMake configuration.

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

## Limitations

The following are currently not handled:

- multiple root `vcpkg.json` manifests
- dynamic rescanning when workspace folders are added or removed after extension activation
- automatic correction of stale CMake package-cache state caused by manual changes to `vcpkg.json`

## License

vcpkg Feature Selector is distributed under the Boost Software License 1.0.

See `LICENSE` for the full license text.
