const CMAKE_FEATURE_ARGUMENT_PREFIX =
    "-DBUILD_VCPKG_FEATURES=";

const GET_SELECTED_FEATURES_COMMAND =
    "vcpkgFeatureSelector.getSelectedFeatures";

const CMAKE_FEATURE_COMMAND_ARGUMENT =
    `${CMAKE_FEATURE_ARGUMENT_PREFIX}` +
    `\${command:${GET_SELECTED_FEATURES_COMMAND}}`;

const SELECTED_FEATURES_STATE_KEY =
    "selectedFeatures";

/**
 * Normalizes a configured feature value into a sorted feature array.
 *
 * @param {unknown} value
 * @returns {string[]}
 */
function normalizeFeatures(value) {
    let features = [];

    if (Array.isArray(value)) {
        features = value;
    } else if (typeof value === "string") {
        features = value.split(";");
    }

    return [...new Set(
        features
            .map(feature => String(feature).trim())
            .filter(feature =>
                feature !== "" &&
                feature !== "none"
            )
    )].sort();
}

/**
 * Converts a normalized feature array to the CMake cache value expected by
 * BUILD_VCPKG_FEATURES.
 *
 * @param {string[]} features
 * @returns {string}
 */
function serializeFeatures(features) {
    return features.length === 0
        ? "none"
        : features.join(";");
}

/**
 * Checks whether two normalized feature arrays contain the same selection.
 *
 * @param {string[]} left
 * @param {string[]} right
 * @returns {boolean}
 */
function areFeatureSelectionsEqual(left, right) {
    return (
        left.length === right.length &&
        left.every(
            (feature, index) =>
                feature === right[index]
        )
    );
}

/**
 * Returns the last legacy literal BUILD_VCPKG_FEATURES value from configure
 * arguments. The command-substitution argument used by current versions is
 * intentionally ignored.
 *
 * @param {unknown} configureArgs
 * @returns {string[] | undefined}
 */
function readLegacyFeatures(configureArgs) {
    if (!Array.isArray(configureArgs)) {
        return undefined;
    }

    const featureArgument =
        [...configureArgs]
            .reverse()
            .find(argument =>
                typeof argument === "string" &&
                argument.startsWith(
                    CMAKE_FEATURE_ARGUMENT_PREFIX
                ) &&
                argument !== CMAKE_FEATURE_COMMAND_ARGUMENT
            );

    if (!featureArgument) {
        return undefined;
    }

    return normalizeFeatures(
        featureArgument.slice(
            CMAKE_FEATURE_ARGUMENT_PREFIX.length
        )
    );
}

/**
 * Replaces any managed BUILD_VCPKG_FEATURES arguments with one stable command
 * substitution while preserving all unrelated configure arguments.
 *
 * @param {unknown} configureArgs
 * @returns {string[]}
 */
function buildIntegratedConfigureArgs(configureArgs) {
    const sourceArgs = Array.isArray(configureArgs)
        ? configureArgs
        : [];

    const unrelatedConfigureArgs =
        sourceArgs.filter(argument =>
            !(
                typeof argument === "string" &&
                argument.startsWith(
                    CMAKE_FEATURE_ARGUMENT_PREFIX
                )
            )
        );

    unrelatedConfigureArgs.push(
        CMAKE_FEATURE_COMMAND_ARGUMENT
    );

    return unrelatedConfigureArgs;
}

/**
 * Checks whether the configure arguments already contain exactly the expected
 * managed command argument and no legacy managed arguments.
 *
 * @param {unknown} configureArgs
 * @returns {boolean}
 */
function hasCurrentCMakeIntegration(configureArgs) {
    if (!Array.isArray(configureArgs)) {
        return false;
    }

    const managedArguments =
        configureArgs.filter(argument =>
            typeof argument === "string" &&
            argument.startsWith(
                CMAKE_FEATURE_ARGUMENT_PREFIX
            )
        );

    return (
        managedArguments.length === 1 &&
        managedArguments[0] ===
            CMAKE_FEATURE_COMMAND_ARGUMENT
    );
}

/**
 * Resolves the active feature selection during extension activation.
 *
 * @param {{
 *   environmentFeatures?: string[],
 *   persistedFeatures?: string[],
 *   legacyFeatures?: string[]
 * }} selections
 * @returns {string[]}
 */
function resolveInitialFeatures({
    environmentFeatures,
    persistedFeatures,
    legacyFeatures
}) {
    if (environmentFeatures !== undefined) {
        return environmentFeatures;
    }

    if (persistedFeatures !== undefined) {
        return persistedFeatures;
    }

    if (legacyFeatures !== undefined) {
        return legacyFeatures;
    }

    return [];
}

module.exports = {
    CMAKE_FEATURE_ARGUMENT_PREFIX,
    CMAKE_FEATURE_COMMAND_ARGUMENT,
    GET_SELECTED_FEATURES_COMMAND,
    SELECTED_FEATURES_STATE_KEY,
    areFeatureSelectionsEqual,
    buildIntegratedConfigureArgs,
    hasCurrentCMakeIntegration,
    normalizeFeatures,
    readLegacyFeatures,
    resolveInitialFeatures,
    serializeFeatures
};
