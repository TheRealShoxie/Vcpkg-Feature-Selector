const assert = require("node:assert/strict");
const test = require("node:test");

const {
    CMAKE_FEATURE_COMMAND_ARGUMENT,
    areFeatureSelectionsEqual,
    buildIntegratedConfigureArgs,
    hasCurrentCMakeIntegration,
    normalizeFeatures,
    readLegacyFeatures,
    resolveInitialFeatures,
    serializeFeatures
} = require("../src/featureState");

test("normalizeFeatures removes empty values, none, duplicates and sorts", () => {
    assert.deepEqual(
        normalizeFeatures(" tests ;none;gui;tests;; "),
        ["gui", "tests"]
    );
});

test("normalizeFeatures accepts arrays", () => {
    assert.deepEqual(
        normalizeFeatures(["standard", "feature-b", "standard"]),
        ["feature-b", "standard"]
    );
});

test("serializeFeatures returns none for an empty selection", () => {
    assert.equal(
        serializeFeatures([]),
        "none"
    );
});

test("serializeFeatures returns a semicolon-separated selection", () => {
    assert.equal(
        serializeFeatures(["gui", "tests"]),
        "gui;tests"
    );
});

test("areFeatureSelectionsEqual compares normalized arrays", () => {
    assert.equal(
        areFeatureSelectionsEqual(
            ["gui", "tests"],
            ["gui", "tests"]
        ),
        true
    );

    assert.equal(
        areFeatureSelectionsEqual(
            ["gui", "tests"],
            ["tests", "gui"]
        ),
        false
    );
});

test("readLegacyFeatures reads the last legacy literal", () => {
    assert.deepEqual(
        readLegacyFeatures([
            "-DSOME_OPTION=ON",
            "-DBUILD_VCPKG_FEATURES=old",
            "-DBUILD_VCPKG_FEATURES=tests;gui"
        ]),
        ["gui", "tests"]
    );
});

test("readLegacyFeatures ignores the command-substitution integration", () => {
    assert.equal(
        readLegacyFeatures([
            "-DSOME_OPTION=ON",
            CMAKE_FEATURE_COMMAND_ARGUMENT
        ]),
        undefined
    );
});

test("buildIntegratedConfigureArgs preserves unrelated arguments", () => {
    assert.deepEqual(
        buildIntegratedConfigureArgs([
            "-DSOME_OPTION=ON",
            "-DBUILD_VCPKG_FEATURES=gui;tests",
            "--warn-uninitialized"
        ]),
        [
            "-DSOME_OPTION=ON",
            "--warn-uninitialized",
            CMAKE_FEATURE_COMMAND_ARGUMENT
        ]
    );
});

test("buildIntegratedConfigureArgs collapses duplicate managed arguments", () => {
    assert.deepEqual(
        buildIntegratedConfigureArgs([
            "-DBUILD_VCPKG_FEATURES=gui",
            CMAKE_FEATURE_COMMAND_ARGUMENT,
            "-DBUILD_VCPKG_FEATURES=tests"
        ]),
        [CMAKE_FEATURE_COMMAND_ARGUMENT]
    );
});

test("hasCurrentCMakeIntegration requires exactly one managed command argument", () => {
    assert.equal(
        hasCurrentCMakeIntegration([
            "-DSOME_OPTION=ON",
            CMAKE_FEATURE_COMMAND_ARGUMENT
        ]),
        true
    );

    assert.equal(
        hasCurrentCMakeIntegration([
            CMAKE_FEATURE_COMMAND_ARGUMENT,
            "-DBUILD_VCPKG_FEATURES=gui"
        ]),
        false
    );
});

test("resolveInitialFeatures prefers environment over persisted over legacy", () => {
    assert.deepEqual(
        resolveInitialFeatures({
            environmentFeatures: ["environment"],
            persistedFeatures: ["persisted"],
            legacyFeatures: ["legacy"]
        }),
        ["environment"]
    );

    assert.deepEqual(
        resolveInitialFeatures({
            persistedFeatures: ["persisted"],
            legacyFeatures: ["legacy"]
        }),
        ["persisted"]
    );

    assert.deepEqual(
        resolveInitialFeatures({
            legacyFeatures: ["legacy"]
        }),
        ["legacy"]
    );

    assert.deepEqual(
        resolveInitialFeatures({}),
        []
    );
});

test("an explicit persisted none selection wins over a legacy value", () => {
    assert.deepEqual(
        resolveInitialFeatures({
            persistedFeatures: [],
            legacyFeatures: ["legacy"]
        }),
        []
    );
});
