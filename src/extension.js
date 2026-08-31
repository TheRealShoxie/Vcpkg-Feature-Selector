const vscode = require("vscode");

const CMAKE_FEATURE_ARGUMENT_PREFIX =
    "-DBUILD_VCPKG_FEATURES=";
    
/**
 * Converts an unknown thrown value into a readable message.
 *
 * @param {unknown} error
 * @returns {string}
 */
function getErrorMessage(error) {
    if (error instanceof Error) {
        return error.message;
    }

    return String(error);
}

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
            .map(feature => feature.trim())
            .filter(feature =>
                feature !== "" &&
                feature !== "none"
            )
    )].sort();
}

/**
 * Reads the vcpkg feature selection defined by the current environment.
 *
 * An empty setting means that the environment does not override the
 * persisted selection.
 *
 * @returns {string[] | undefined}
 */
function readEnvironmentFeatures() {
    const configuration =
        vscode.workspace.getConfiguration(
            "vcpkgFeatureSelector"
        );

    const environmentFeatures =
        configuration.get(
            "environmentFeatures",
            ""
        );

    if (
        typeof environmentFeatures !== "string" ||
        environmentFeatures.trim() === ""
    ) {
        return undefined;
    }

    return normalizeFeatures(
        environmentFeatures
    );
}

/**
 * Reads the currently configured vcpkg features from CMake Tools.
 *
 * @param {vscode.WorkspaceFolder} workspaceFolder
 * @returns {string[]}
 */
function readConfiguredFeatures(workspaceFolder) {
    const configuration =
        vscode.workspace.getConfiguration(
            "cmake",
            workspaceFolder.uri
        );

    const configureArgs =
        configuration.get("configureArgs", []);

    const featureArgument =
        [...configureArgs]
            .reverse()
            .find(argument =>
                typeof argument === "string" &&
                argument.startsWith(
                    CMAKE_FEATURE_ARGUMENT_PREFIX
                )
            );

    if (!featureArgument) {
        return [];
    }

    return normalizeFeatures(
        featureArgument.slice(
            CMAKE_FEATURE_ARGUMENT_PREFIX.length
        )
    );
}


/**
 * Writes the selected vcpkg features to CMake Tools.
 *
 * @param {vscode.WorkspaceFolder} workspaceFolder
 * @param {string[]} selectedFeatures
 */
async function writeConfiguredFeatures(
    workspaceFolder,
    selectedFeatures
) {
    const configuration =
        vscode.workspace.getConfiguration(
            "cmake",
            workspaceFolder.uri
        );

    const configureArgsInspection =
        configuration.inspect(
            "configureArgs"
        );

    const isWorkspaceFileOpen =
        vscode.workspace.workspaceFile !== undefined;

    const configurationTarget =
        isWorkspaceFileOpen
            ? vscode.ConfigurationTarget.WorkspaceFolder
            : vscode.ConfigurationTarget.Workspace;

    const configuredConfigureArgs =
        isWorkspaceFileOpen
            ? configureArgsInspection?.workspaceFolderValue
            : configureArgsInspection?.workspaceValue;

    const configureArgs =
        Array.isArray(configuredConfigureArgs)
            ? [...configuredConfigureArgs]
            : [
                ...configuration.get(
                    "configureArgs",
                    []
                )
            ];

    const unrelatedConfigureArgs =
        configureArgs.filter(argument =>
            !(
                typeof argument === "string" &&
                argument.startsWith(
                    CMAKE_FEATURE_ARGUMENT_PREFIX
                )
            )
        );

    const featureValue =
        selectedFeatures.length === 0
            ? "none"
            : selectedFeatures.join(";");

    unrelatedConfigureArgs.push(
        `${CMAKE_FEATURE_ARGUMENT_PREFIX}${featureValue}`
    );

    await configuration.update(
        "configureArgs",
        unrelatedConfigureArgs,
        configurationTarget
    );
}

/**
 * Finds all root vcpkg.json manifests in the currently opened
 * workspace folders.
 *
 * @returns {Promise<vscode.Uri[]>}
 */
async function findManifests() {
    const workspaceFolders =
        vscode.workspace.workspaceFolders;

    if (!workspaceFolders) {
        return [];
    }

    const manifestUris = [];

    for (const workspaceFolder of workspaceFolders) {
        const manifestUri = vscode.Uri.joinPath(
            workspaceFolder.uri,
            "vcpkg.json"
        );

        try {
            await vscode.workspace.fs.stat(
                manifestUri
            );

            manifestUris.push(
                manifestUri
            );
        } catch {
            // No vcpkg.json in this workspace folder.
        }
    }

    return manifestUris;
}

/**
 * Reads the available features from vcpkg.json.
 *
 * @param {vscode.Uri} manifestUri
 * @returns {Promise<Array<{
 *   label: string,
 *   description?: string
 * }>>}
 */
async function readManifestFeatures(manifestUri) {
    const contents = await vscode.workspace.fs.readFile(manifestUri);
    const manifestText = Buffer.from(contents).toString("utf8");
    const manifest = JSON.parse(manifestText);

    if (
        manifest.features === undefined ||
        manifest.features === null ||
        typeof manifest.features !== "object" ||
        Array.isArray(manifest.features)
    ) {
        return [];
    }

    return Object.entries(manifest.features)
        .map(([name, definition]) => ({
            label: name,
            description:
                typeof definition?.description === "string"
                    ? definition.description
                    : undefined
        }))
        .sort(
            (left, right) =>
                left.label.localeCompare(right.label)
        );
}

/**
 * Updates the status bar text and tooltip.
 *
 * @param {vscode.StatusBarItem} statusBarItem
 * @param {string[]} selectedFeatures
 * @param {Array<{label: string, description?: string}>} availableFeatures
 */
function updateStatusBar(
    statusBarItem,
    selectedFeatures,
    availableFeatures
) {
    const availableFeatureSet =
        new Set(
            availableFeatures.map(
                feature => feature.label
            )
        );

    const unavailableSelectedFeatures =
        selectedFeatures.filter(
            feature => !availableFeatureSet.has(feature)
        );

    if (unavailableSelectedFeatures.length > 0) {
        statusBarItem.text =
            `$(warning) $(package) ${selectedFeatures.length}`;

        statusBarItem.tooltip =
            "Selected vcpkg feature(s) no longer exist: " +
            unavailableSelectedFeatures.join(", ");

        return;
    }

    if (selectedFeatures.length === 0) {
        statusBarItem.text = "$(package) none";
        statusBarItem.tooltip =
            "Selected vcpkg features: none";
    } else {
        statusBarItem.text =
            `$(package) ${selectedFeatures.length}`;

        statusBarItem.tooltip =
            `Selected vcpkg features: ${selectedFeatures.join(", ")}`;
    }
}

/**
 * Shows the vcpkg feature selector.
 *
 * @param {Array<{label: string, description?: string}>} availableFeatures
 * @param {string[]} selectedFeatures
 * @returns {Promise<string[] | undefined>}
 */
async function selectFeatures(
    availableFeatures,
    selectedFeatures
) {
    const selectedFeatureSet = new Set(selectedFeatures);

    const items = [
        {
            label: "none",
            description: "No optional vcpkg features",
            picked: selectedFeatures.length === 0
        },
        ...availableFeatures.map(feature => ({
            label: feature.label,
            description: feature.description,
            picked: selectedFeatureSet.has(
                feature.label
            )
        }))
    ];

    const selection = await vscode.window.showQuickPick(
        items,
        {
            canPickMany: true,
            placeHolder: "Select vcpkg manifest features"
        }
    );

    if (selection === undefined) {
        return undefined;
    }

    const features = selection
        .map(item => item.label)
        .filter(feature => feature !== "none");

    return [...new Set(features)].sort();
}

/**
 * Called by VS Code when the extension is activated.
 *
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {
    const statusBarItem = vscode.window.createStatusBarItem(
        vscode.StatusBarAlignment.Left,
        100
    );

    context.subscriptions.push(statusBarItem);

    let selectFeaturesHandler;
    let manifestUsable = false;
    let selectorUnavailableMessage =
        "vcpkg Feature Selector is not available in the current workspace";

    const selectFeaturesCommand =
        vscode.commands.registerCommand(
            "vcpkgFeatureSelector.selectFeatures",
            async () => {
                if (
                    !selectFeaturesHandler ||
                    !manifestUsable
                ) {
                    vscode.window.showErrorMessage(
                        selectorUnavailableMessage
                    );

                    return;
                }

                await selectFeaturesHandler();
            }
        );

    context.subscriptions.push(
        selectFeaturesCommand
    );

    statusBarItem.command =
        "vcpkgFeatureSelector.selectFeatures";

    const manifestUris =
        await findManifests();

    if (manifestUris.length === 0) {
        selectorUnavailableMessage =
            "No vcpkg.json found in the workspace";

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;

        statusBarItem.show();
        return;
    }

    if (manifestUris.length > 1) {
        selectorUnavailableMessage =
            "Multiple root vcpkg.json manifests found; " +
            "multi-root workspaces are not supported";

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;

        statusBarItem.show();
        return;
    }

    const manifestUri =
        manifestUris[0];

    const workspaceFolder =
        vscode.workspace.getWorkspaceFolder(manifestUri);

    if (!workspaceFolder) {
        selectorUnavailableMessage =
            "Could not determine the workspace folder for vcpkg.json";

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;

        statusBarItem.show();
        return;
    }

    const cmakeToolsExtension =
        vscode.extensions.getExtension(
            "ms-vscode.cmake-tools"
        );

    if (!cmakeToolsExtension) {
        selectorUnavailableMessage =
            "CMake Tools is required for vcpkg feature selection";

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;

        statusBarItem.show();
        return;
    }

    let availableFeatures = [];
    let selectedFeatures = readConfiguredFeatures(workspaceFolder);
    let environmentSelectionChanged = false;

    const environmentFeatures =
        readEnvironmentFeatures();

    if (
        environmentFeatures !== undefined &&
        !areFeatureSelectionsEqual(
            environmentFeatures,
            selectedFeatures
        )
    ) {
        try {
            await writeConfiguredFeatures(
                workspaceFolder,
                environmentFeatures
            );

            selectedFeatures =
                environmentFeatures;

            environmentSelectionChanged = true;
        } catch (error) {
            selectorUnavailableMessage =
                "Failed to apply environment vcpkg features: " +
                getErrorMessage(error);

            statusBarItem.text =
                "$(error) $(package)";

            statusBarItem.tooltip =
                selectorUnavailableMessage;

            statusBarItem.show();
            return;
        }
    }

    async function refreshManifestFeatures() {
        try {
            availableFeatures =
                await readManifestFeatures(manifestUri);

            manifestUsable = true;

            updateStatusBar(
                statusBarItem,
                selectedFeatures,
                availableFeatures
            );
        } catch (error) {
            availableFeatures = [];
            manifestUsable = false;

            selectorUnavailableMessage =
                "Failed to read vcpkg.json: " +
                getErrorMessage(error);

            statusBarItem.text =
                "$(error) $(package)";

            statusBarItem.tooltip =
                selectorUnavailableMessage;
        }
    }

    await refreshManifestFeatures();

    if (environmentSelectionChanged && manifestUsable) {
        try {
            await vscode.commands.executeCommand(
                "cmake.cleanConfigure"
            );
        } catch (error) {
            vscode.window.showErrorMessage(
                "The environment vcpkg feature selection was saved, " +
                "but CMake clean configure could not be started: " +
                getErrorMessage(error)
            );
        }
    }


    selectFeaturesHandler =
        async () => {
            const selection = await selectFeatures(
                availableFeatures,
                selectedFeatures
            );

            if (selection === undefined) {
                return;
            }

            if (
                areFeatureSelectionsEqual(
                    selection,
                    selectedFeatures
                )
            ) {
                return;
            }

            try {
                await writeConfiguredFeatures(
                    workspaceFolder,
                    selection
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    "Failed to save the selected vcpkg features: " +
                    getErrorMessage(error)
                );

                return;
            }

            try {
                await vscode.commands.executeCommand(
                    "cmake.cleanConfigure"
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    "The vcpkg feature selection was saved, " +
                    "but CMake clean configure could not be started: " +
                    getErrorMessage(error)
                );
            }
        };

    const manifestWatcher =
        vscode.workspace.createFileSystemWatcher(
            new vscode.RelativePattern(
                workspaceFolder,
                "vcpkg.json"
            )
        );

    manifestWatcher.onDidChange(
        refreshManifestFeatures
    );

    manifestWatcher.onDidCreate(
        refreshManifestFeatures
    );

    manifestWatcher.onDidDelete(() => {
        availableFeatures = [];
        manifestUsable = false;

        selectorUnavailableMessage =
            "vcpkg.json was removed";

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;
    });

    context.subscriptions.push(
        manifestWatcher
    );

    const configurationChangeListener =
        vscode.workspace.onDidChangeConfiguration(
            event => {
                if (
                    !event.affectsConfiguration(
                        "cmake.configureArgs",
                        workspaceFolder.uri
                    )
                ) {
                    return;
                }

                selectedFeatures =
                    readConfiguredFeatures(
                        workspaceFolder
                    );

                if (!manifestUsable) {
                    return;
                }

                updateStatusBar(
                    statusBarItem,
                    selectedFeatures,
                    availableFeatures
                );
            }
        );

    context.subscriptions.push(
        configurationChangeListener
    );

    statusBarItem.show();
}

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
 * Called by VS Code when the extension is deactivated.
 */
function deactivate() {
}

module.exports = {
    activate,
    deactivate
};