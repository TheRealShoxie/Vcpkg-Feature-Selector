# Changelog

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