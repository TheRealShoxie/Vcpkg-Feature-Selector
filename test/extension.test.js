const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");

const {
    CMAKE_FEATURE_COMMAND_ARGUMENT,
    GET_SELECTED_FEATURES_COMMAND,
    SELECTED_FEATURES_STATE_KEY
} = require("../src/featureState");

function createContext(initialState) {
    const state = new Map(
        initialState === undefined
            ? []
            : [[SELECTED_FEATURES_STATE_KEY, initialState]]
    );

    return {
        subscriptions: [],
        workspaceState: {
            get(key) {
                return state.get(key);
            },
            async update(key, value) {
                state.set(key, value);
            }
        },
        getState() {
            return state.get(SELECTED_FEATURES_STATE_KEY);
        }
    };
}

function createVscodeMock({
    configureArgs = [],
    environmentFeatures = "",
    manifestFeatures = {
        gui: { description: "GUI" },
        tests: { description: "Tests" }
    },
    manifestExists = true,
    quickPickLabels
} = {}) {
    const commands = new Map();
    const executedCommands = [];
    const configureUpdates = [];
    const errorMessages = [];
    const watcherCallbacks = {};

    let currentConfigureArgs = [...configureArgs];
    let currentManifestFeatures = manifestFeatures;
    let currentQuickPickLabels = quickPickLabels;

    const workspaceFolder = {
        name: "example",
        uri: {
            fsPath: "/workspace/example",
            path: "/workspace/example"
        }
    };

    const statusBarItem = {
        text: "",
        tooltip: "",
        command: undefined,
        shown: false,
        show() {
            this.shown = true;
        },
        dispose() {}
    };

    const cmakeConfiguration = {
        get(key, defaultValue) {
            if (key === "configureArgs") {
                return [...currentConfigureArgs];
            }
            return defaultValue;
        },
        inspect(key) {
            if (key !== "configureArgs") {
                return undefined;
            }
            return {
                workspaceValue: [...currentConfigureArgs],
                workspaceFolderValue: undefined
            };
        },
        async update(key, value, target) {
            assert.equal(key, "configureArgs");
            currentConfigureArgs = [...value];
            configureUpdates.push({
                key,
                value: [...value],
                target
            });
        }
    };

    const vscode = {
        ConfigurationTarget: {
            Workspace: "workspace",
            WorkspaceFolder: "workspaceFolder"
        },
        RelativePattern: class RelativePattern {
            constructor(folder, pattern) {
                this.folder = folder;
                this.pattern = pattern;
            }
        },
        StatusBarAlignment: {
            Left: 1
        },
        Uri: {
            joinPath(uri, child) {
                return {
                    fsPath: path.posix.join(uri.fsPath, child),
                    path: path.posix.join(uri.path, child)
                };
            }
        },
        commands: {
            registerCommand(id, callback) {
                commands.set(id, callback);
                return {
                    dispose() {
                        commands.delete(id);
                    }
                };
            },
            async executeCommand(id, ...args) {
                executedCommands.push({ id, args });
                if (commands.has(id)) {
                    return commands.get(id)(...args);
                }
                return undefined;
            }
        },
        extensions: {
            getExtension(id) {
                return id === "ms-vscode.cmake-tools"
                    ? { id }
                    : undefined;
            }
        },
        window: {
            createStatusBarItem() {
                return statusBarItem;
            },
            showErrorMessage(message) {
                errorMessages.push(message);
            },
            async showQuickPick(items) {
                if (currentQuickPickLabels === undefined) {
                    return undefined;
                }

                return currentQuickPickLabels.map(label => {
                    const item = items.find(
                        candidate => candidate.label === label
                    );
                    assert.ok(item, `Quick-pick item '${label}' exists`);
                    return item;
                });
            }
        },
        workspace: {
            workspaceFolders: [workspaceFolder],
            workspaceFile: undefined,
            fs: {
                async stat() {
                    if (!manifestExists) {
                        throw new Error("ENOENT");
                    }
                    return { type: 1 };
                },
                async readFile() {
                    return Buffer.from(
                        JSON.stringify({
                            features: currentManifestFeatures
                        })
                    );
                }
            },
            getWorkspaceFolder() {
                return workspaceFolder;
            },
            getConfiguration(section) {
                if (section === "cmake") {
                    return cmakeConfiguration;
                }

                if (section === "vcpkgFeatureSelector") {
                    return {
                        get(key, defaultValue) {
                            return key === "environmentFeatures"
                                ? environmentFeatures
                                : defaultValue;
                        }
                    };
                }

                throw new Error(`Unexpected configuration section: ${section}`);
            },
            createFileSystemWatcher() {
                return {
                    onDidChange(callback) {
                        watcherCallbacks.change = callback;
                    },
                    onDidCreate(callback) {
                        watcherCallbacks.create = callback;
                    },
                    onDidDelete(callback) {
                        watcherCallbacks.delete = callback;
                    },
                    dispose() {}
                };
            }
        }
    };

    return {
        vscode,
        statusBarItem,
        configureUpdates,
        errorMessages,
        executedCommands,
        getConfigureArgs: () => [...currentConfigureArgs],
        setManifestFeatures(value) {
            currentManifestFeatures = value;
        },
        setQuickPickLabels(value) {
            currentQuickPickLabels = value;
        },
        async invokeCommand(id, ...args) {
            assert.ok(commands.has(id), `Command '${id}' is registered`);
            return commands.get(id)(...args);
        },
        async fireManifestChange() {
            assert.ok(watcherCallbacks.change);
            await watcherCallbacks.change();
        }
    };
}

function loadExtension(vscodeMock) {
    const extensionPath = require.resolve("../src/extension");
    delete require.cache[extensionPath];

    const originalLoad = Module._load;
    Module._load = function patchedLoad(request, parent, isMain) {
        if (request === "vscode") {
            return vscodeMock;
        }
        return originalLoad.call(this, request, parent, isMain);
    };

    try {
        return require("../src/extension");
    } finally {
        Module._load = originalLoad;
    }
}

function cleanConfigureCount(mock) {
    return mock.executedCommands.filter(
        command => command.id === "cmake.cleanConfigure"
    ).length;
}

test("activation migrates a legacy literal without changing the effective selection", async () => {
    const mock = createVscodeMock({
        configureArgs: [
            "-DSOME_OPTION=ON",
            "-DBUILD_VCPKG_FEATURES=tests;gui"
        ]
    });
    const context = createContext();
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.deepEqual(context.getState(), ["gui", "tests"]);
    assert.deepEqual(mock.getConfigureArgs(), [
        "-DSOME_OPTION=ON",
        CMAKE_FEATURE_COMMAND_ARGUMENT
    ]);
    assert.equal(mock.configureUpdates.length, 1);
    assert.equal(cleanConfigureCount(mock), 0);
    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui;tests"
    );
});

test("environmentFeatures overrides persisted state and clean-configures once", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        environmentFeatures: "tests"
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.deepEqual(context.getState(), ["tests"]);
    assert.equal(cleanConfigureCount(mock), 1);
    assert.equal(mock.configureUpdates.length, 0);
    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "tests"
    );
});

test("interactive selection updates extension state without modifying cmake.configureArgs", async () => {
    const mock = createVscodeMock({
        configureArgs: [
            "-DSOME_OPTION=ON",
            CMAKE_FEATURE_COMMAND_ARGUMENT
        ],
        quickPickLabels: ["tests"]
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);
    await mock.invokeCommand("vcpkgFeatureSelector.selectFeatures");

    assert.deepEqual(context.getState(), ["tests"]);
    assert.deepEqual(mock.getConfigureArgs(), [
        "-DSOME_OPTION=ON",
        CMAKE_FEATURE_COMMAND_ARGUMENT
    ]);
    assert.equal(mock.configureUpdates.length, 0);
    assert.equal(cleanConfigureCount(mock), 1);
    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "tests"
    );
});

test("selecting the already active feature set does not clean-configure", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        quickPickLabels: ["gui"]
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);
    await mock.invokeCommand("vcpkgFeatureSelector.selectFeatures");

    assert.deepEqual(context.getState(), ["gui"]);
    assert.equal(cleanConfigureCount(mock), 0);
});

test("manifest changes refresh warning state without changing selection or configuring", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT]
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);
    mock.setManifestFeatures({
        tests: { description: "Tests" }
    });
    await mock.fireManifestChange();

    assert.deepEqual(context.getState(), ["gui"]);
    assert.match(mock.statusBarItem.text, /warning/);
    assert.match(mock.statusBarItem.tooltip, /gui/);
    assert.equal(cleanConfigureCount(mock), 0);
});

test("two extension contexts can keep independent selections for the same workspace files", async () => {
    const sharedArgs = [CMAKE_FEATURE_COMMAND_ARGUMENT];

    const mockA = createVscodeMock({
        configureArgs: sharedArgs,
        environmentFeatures: "gui",
        quickPickLabels: ["tests"]
    });
    const mockB = createVscodeMock({
        configureArgs: sharedArgs,
        environmentFeatures: "gui;tests"
    });

    const contextA = createContext();
    const contextB = createContext();

    const extensionA = loadExtension(mockA.vscode);
    await extensionA.activate(contextA);

    const extensionB = loadExtension(mockB.vscode);
    await extensionB.activate(contextB);

    assert.equal(
        await mockA.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui"
    );
    assert.equal(
        await mockB.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui;tests"
    );

    await mockA.invokeCommand("vcpkgFeatureSelector.selectFeatures");

    assert.equal(
        await mockA.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "tests"
    );
    assert.equal(
        await mockB.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui;tests"
    );
    assert.equal(mockA.configureUpdates.length, 0);
    assert.equal(mockB.configureUpdates.length, 0);
});

test("persisted selection is restored when environmentFeatures is empty", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        environmentFeatures: ""
    });
    const context = createContext(["gui", "tests"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui;tests"
    );
    assert.equal(cleanConfigureCount(mock), 0);
    assert.equal(mock.configureUpdates.length, 0);
});

test("matching environmentFeatures does not clean-configure", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        environmentFeatures: "tests;gui"
    });
    const context = createContext(["gui", "tests"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.deepEqual(context.getState(), ["gui", "tests"]);
    assert.equal(cleanConfigureCount(mock), 0);
});

test("getSelectedFeatures remains available when no manifest exists", async () => {
    const mock = createVscodeMock({
        manifestExists: false,
        environmentFeatures: "tests;gui"
    });
    const context = createContext();
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "gui;tests"
    );
    assert.match(mock.statusBarItem.tooltip, /No vcpkg\.json/);
});

test("explicit environment none overrides persisted features", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        environmentFeatures: "none"
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);

    assert.deepEqual(context.getState(), []);
    assert.equal(
        await mock.invokeCommand(GET_SELECTED_FEATURES_COMMAND),
        "none"
    );
    assert.equal(cleanConfigureCount(mock), 1);
});

test("cancelling the selector leaves state unchanged and does not configure", async () => {
    const mock = createVscodeMock({
        configureArgs: [CMAKE_FEATURE_COMMAND_ARGUMENT],
        quickPickLabels: undefined
    });
    const context = createContext(["gui"]);
    const extension = loadExtension(mock.vscode);

    await extension.activate(context);
    await mock.invokeCommand("vcpkgFeatureSelector.selectFeatures");

    assert.deepEqual(context.getState(), ["gui"]);
    assert.equal(cleanConfigureCount(mock), 0);
});
