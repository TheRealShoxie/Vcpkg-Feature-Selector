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
    vcpkg_feature_selector_example
    LANGUAGES CXX
)

add_executable(
    vcpkg-feature-selector-example
    main.cpp
)

target_compile_features(
    vcpkg-feature-selector-example
    PRIVATE
        cxx_std_23
)

if("gui" IN_LIST VCPKG_MANIFEST_FEATURES)
    find_package(
        imgui
        CONFIG
        REQUIRED
    )

    target_link_libraries(
        vcpkg-feature-selector-example
        PRIVATE
            imgui::imgui
    )

    target_compile_definitions(
        vcpkg-feature-selector-example
        PRIVATE
            VCPKG_FEATURE_SELECTOR_GUI
    )
endif()