const vscode = require("vscode");

const {
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
} = require("./featureState");

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
 * Reads the persisted extension-owned feature selection.
 *
 * @param {vscode.ExtensionContext} context
 * @returns {string[] | undefined}
 */
function readPersistedFeatures(context) {
    const persistedFeatures =
        context.workspaceState.get(
            SELECTED_FEATURES_STATE_KEY
        );

    if (persistedFeatures === undefined) {
        return undefined;
    }

    return normalizeFeatures(
        persistedFeatures
    );
}

/**
 * Persists the active feature selection without modifying workspace files.
 *
 * @param {vscode.ExtensionContext} context
 * @param {string[]} selectedFeatures
 */
async function writePersistedFeatures(
    context,
    selectedFeatures
) {
    await context.workspaceState.update(
        SELECTED_FEATURES_STATE_KEY,
        selectedFeatures
    );
}

/**
 * Reads the configure arguments from the configuration scope that this
 * extension manages.
 *
 * @param {vscode.WorkspaceFolder} workspaceFolder
 * @returns {{
 *   configuration: vscode.WorkspaceConfiguration,
 *   configurationTarget: vscode.ConfigurationTarget,
 *   configureArgs: unknown[]
 * }}
 */
function readCMakeConfigureState(workspaceFolder) {
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

    return {
        configuration,
        configurationTarget,
        configureArgs
    };
}

/**
 * Ensures that CMake Tools obtains BUILD_VCPKG_FEATURES from the extension
 * command rather than from a mutable workspace value.
 *
 * Existing literal BUILD_VCPKG_FEATURES arguments are migrated while all
 * unrelated configure arguments are preserved.
 *
 * @param {ReturnType<typeof readCMakeConfigureState>} configureState
 * @returns {Promise<boolean>} true when the CMake setting was changed
 */
async function ensureCMakeIntegration(
    configureState
) {
    if (
        hasCurrentCMakeIntegration(
            configureState.configureArgs
        )
    ) {
        return false;
    }

    await configureState.configuration.update(
        "configureArgs",
        buildIntegratedConfigureArgs(
            configureState.configureArgs
        ),
        configureState.configurationTarget
    );

    return true;
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

    return normalizeFeatures(features);
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

    const persistedFeatures =
        readPersistedFeatures(context);

    const environmentFeatures =
        readEnvironmentFeatures();

    let selectedFeatures =
        resolveInitialFeatures({
            environmentFeatures,
            persistedFeatures
        });

    const getSelectedFeaturesCommand =
        vscode.commands.registerCommand(
            GET_SELECTED_FEATURES_COMMAND,
            () => serializeFeatures(selectedFeatures)
        );

    context.subscriptions.push(
        getSelectedFeaturesCommand
    );

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

    const configureState =
        readCMakeConfigureState(workspaceFolder);

    const legacyFeatures =
        readLegacyFeatures(
            configureState.configureArgs
        );

    const previousFeatures =
        resolveInitialFeatures({
            persistedFeatures,
            legacyFeatures
        });

    selectedFeatures =
        resolveInitialFeatures({
            environmentFeatures,
            persistedFeatures,
            legacyFeatures
        });

    const environmentSelectionChanged =
        environmentFeatures !== undefined &&
        !areFeatureSelectionsEqual(
            environmentFeatures,
            previousFeatures
        );

    try {
        await ensureCMakeIntegration(
            configureState
        );

        if (
            persistedFeatures === undefined ||
            !areFeatureSelectionsEqual(
                selectedFeatures,
                persistedFeatures
            )
        ) {
            await writePersistedFeatures(
                context,
                selectedFeatures
            );
        }
    } catch (error) {
        selectorUnavailableMessage =
            "Failed to initialize vcpkg feature selection: " +
            getErrorMessage(error);

        statusBarItem.text =
            "$(error) $(package)";

        statusBarItem.tooltip =
            selectorUnavailableMessage;

        statusBarItem.show();
        return;
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

    let availableFeatures = [];

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
                await writePersistedFeatures(
                    context,
                    selection
                );
            } catch (error) {
                vscode.window.showErrorMessage(
                    "Failed to save the selected vcpkg features: " +
                    getErrorMessage(error)
                );

                return;
            }

            selectedFeatures = selection;

            updateStatusBar(
                statusBarItem,
                selectedFeatures,
                availableFeatures
            );

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

    statusBarItem.show();
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