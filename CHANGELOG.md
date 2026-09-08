# Changelog

## 0.2.0 - 2026-09-08

- Store the active feature selection in extension-owned workspace state instead of a literal value in shared `cmake.configureArgs`.
- Expose the active selection through the internal `vcpkgFeatureSelector.getSelectedFeatures` command and a stable CMake Tools `${command:...}` configure argument.
- Preserve feature selections across workspace reopen when `environmentFeatures` is empty while keeping non-empty environment selections as startup overrides.
- Isolate feature selections between independent Remote / Dev Container extension hosts sharing the same source checkout.
- Migrate legacy literal `-DBUILD_VCPKG_FEATURES=...` configure arguments while preserving unrelated CMake configure arguments.
- Preserve clean-configure behavior for interactive and environment-driven selection changes.
- Preserve manifest watching, missing-feature warnings, `none` handling, sorting and duplicate removal.
- Add dependency-free automated regression tests and run them automatically before launching the Extension Development Host.
- Document persistence, migration, Dev Container isolation, command-line behavior and the development/test workflow.

## 0.1.2 - 2026-08-31

- Changed the Marketplace display name to `vcpkg CMake Feature Selector` because the previous display name was already reserved by an earlier Marketplace publication.
- No functional changes.

## 0.1.1 - 2026-08-31

- Changed the Marketplace extension identifier from `vcpkg-feature-selector` to `vcpkg-cmake-feature-selector` because the previous identifier was already reserved by an earlier Marketplace publication.
- No functional changes.

## 0.1.0 - 2026-08-31

- Changed the project license to the Boost Software License 1.0.
- Added installation and VSIX packaging documentation.
- Added documented CMake integration from `BUILD_VCPKG_FEATURES` to `VCPKG_MANIFEST_FEATURES`.
- Added a standalone public CMake/vcpkg example using an optional Dear ImGui feature.
- Made the extension development launch configuration self-contained.
- Added an extension icon for the Visual Studio Marketplace.

## 0.0.2

- Added environment-specific default vcpkg feature selections.
- Added the `vcpkgFeatureSelector.environmentFeatures` setting.
- Development environments can now establish their intended vcpkg feature set when the extension starts.
- Environment feature selections are applied through the existing `cmake.configureArgs` integration.
- Changing the environment feature set triggers a clean CMake configure when necessary.
- Leaving `vcpkgFeatureSelector.environmentFeatures` empty preserves the existing persisted selection.

## 0.0.1

- Initial release.
- Dynamically discovers vcpkg manifest features.
- Supports multiple feature selection.
- Integrates with CMake Tools through `cmake.configureArgs`.
- Triggers a clean configure when the selected feature set changes.
- Watches `vcpkg.json` for feature and description changes.
- Handles invalid, removed, and restored manifests.
- Supports single-folder workspaces and workspace files with one root manifest.