/**
 * @name Hyde
 * @authorId 278543574059057154
 * @invite Jx3TjNS
 * @website https://github.com/randoguyname/BetterDiscordAddons/tree/master/Plugins/Hyde
 * @source https://raw.githubusercontent.com/randoguyname/BetterDiscordAddons/master/Plugins/Hyde/Hyde.plugin.js
 * @updateUrl https://raw.githubusercontent.com/randoguyname/BetterDiscordAddons/master/Plugins/Hyde/Hyde.plugin.js
 */

function stretchString(string, length) {
    let newString = ""
    let index = 1
    for (let char of string) {
        newString += char.repeat((index > string.length - length % string.length ? 1 : 0) + Math.floor(length / string.length))
        index += 1
    }
    return newString
}
module.exports = (_ => {
    const config = {
        "info": {
            "name": "Hyde",
            "author": "DevilBro & LunaNova",
            "version": "1.3.1",
            "description": "Allow the user to censor words or block complete messages based on words in the chatwindow. NEW also allows user to add to a list of deadnames to be replaced with the actual name."
        },
        "changeLog": {
            "fixed": {
                "Possessive endings": "Added possessive endings to deadnames",
                "Improved long type (SmartHyde)": "Stretched words now stretch more faithfully to the original message",
            }
        }
    };

    return !window.BDFDB_Global || (!window.BDFDB_Global.loaded && !window.BDFDB_Global.started) ? class {
        getName() { return config.info.name; }
        getAuthor() { return config.info.author; }
        getVersion() { return config.info.version; }
        getDescription() { return `The Library Plugin needed for ${config.info.name} is missing. Open the Plugin Settings to download it.\n\n${config.info.description}`; }

        load() {
            if (!window.BDFDB_Global || !Array.isArray(window.BDFDB_Global.pluginQueue)) window.BDFDB_Global = Object.assign({}, window.BDFDB_Global, { pluginQueue: [] });
            if (!window.BDFDB_Global.downloadModal) {
                window.BDFDB_Global.downloadModal = true;
                BdApi.showConfirmationModal("Library Missing", `The Library Plugin needed for ${config.info.name} is missing. Please click "Download Now" to install it.`, {
                    confirmText: "Download Now",
                    cancelText: "Cancel",
                    onCancel: _ => { delete window.BDFDB_Global.downloadModal; },
                    onConfirm: _ => {
                        delete window.BDFDB_Global.downloadModal;
                        require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
                            if (!e && b && b.indexOf(`* @name BDFDB`) > -1) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => {});
                            else BdApi.alert("Error", "Could not download BDFDB Library Plugin, try again later or download it manually from GitHub: https://github.com/mwittrien/BetterDiscordAddons/tree/master/Library/");
                        });
                    }
                });
            }
            if (!window.BDFDB_Global.pluginQueue.includes(config.info.name)) window.BDFDB_Global.pluginQueue.push(config.info.name);
        }
        start() { this.load(); }
        stop() {}
        getSettingsPanel() {
            let template = document.createElement("template");
            template.innerHTML = `<div style="color: var(--header-primary); font-size: 16px; font-weight: 300; white-space: pre; line-height: 22px;">The Library Plugin needed for ${config.info.name} is missing.\nPlease click <a style="font-weight: 500;">Download Now</a> to install it.</div>`;
            template.content.firstElementChild.querySelector("a").addEventListener("click", _ => {
                require("request").get("https://mwittrien.github.io/BetterDiscordAddons/Library/0BDFDB.plugin.js", (e, r, b) => {
                    if (!e && b && b.indexOf(`* @name BDFDB`) > -1) require("fs").writeFile(require("path").join(BdApi.Plugins.folder, "0BDFDB.plugin.js"), b, _ => {});
                    else BdApi.alert("Error", "Could not download BDFDB Library Plugin, try again later or download it manually from GitHub: https://github.com/mwittrien/BetterDiscordAddons/tree/master/Library/");
                });
            });
            return template.content.firstElementChild;
        }
    } : (([Plugin, BDFDB]) => {
        var oldBlockedMessages, oldCensoredMessages, oldDeadnameMessages, words;
        var settings = {},
            replaces = {},
            configs = {};

        return class Hyde extends Plugin {
            onLoad() {
                this.defaults = {
                    configs: {
                        empty: { value: false, description: "Allow the replacevalue to be empty (ignoring the default)" },
                        case: { value: false, description: "Handle the wordvalue case sensitive" },
                        exact: { value: true, description: "Handle the wordvalue as an exact word and not as part of a word" },
                        regex: { value: false, description: "Handle the wordvalue as a RegExp string" },
                        smart: { value: true, description: "Attempts to mimic case and text decoration when replacing words" }
                    },
                    replaces: {
                        blocked: { value: "~~BLOCKED~~", description: "Default replaceword for blocked messages: " },
                        censored: { value: "$!%&%!&", description: "Default replaceword for censored messages: " },
                        deadname: { value: "~DEADNAME~", description: "Default replaceword for deadnames" }
                    },
                    settings: {
                        addContextMenu: { value: true, description: "Add a contextmenu entry to faster add new blocked/censored words or deadnames: " }
                    }
                };

                this.patchedModules = {
                    before: {
                        Message: "default",
                        MessageContent: "type"
                    },
                    after: {
                        Messages: "type",
                        MessageContent: "type",
                        Embed: "render"
                    }
                };

                this.css = `
					${BDFDB.dotCN._chatfilterblocked} {
						color: ${BDFDB.DiscordConstants.Colors.STATUS_RED} !important;
					}
					${BDFDB.dotCN.messagerepliedmessagecontentclickable}:hover ${BDFDB.dotCN._chatfilterblocked} {
						filter: saturate(2);
					}
				`;

            }

            onStart() {
                words = BDFDB.DataUtils.load(this, "words");
                for (let rType in this.defaults.replaces)
                    if (!BDFDB.ObjectUtils.is(words[rType])) words[rType] = {};

                this.forceUpdateAll();
            }

            onStop() {
                this.forceUpdateAll();
            }

            getSettingsPanel(collapseStates = {}) {
                let settingsPanel, settingsItems = [];

                settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                    title: "Settings",
                    collapseStates: collapseStates,
                    children: Object.keys(settings).map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
                        type: "Switch",
                        plugin: this,
                        keys: ["settings", key],
                        label: this.defaults.settings[key].description,
                        value: settings[key]
                    })).concat(Object.keys(replaces).map(rType => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsSaveItem, {
                        type: "TextInput",
                        plugin: this,
                        keys: ["replaces", rType],
                        label: this.defaults.replaces[rType].description,
                        value: replaces[rType],
                        placeholder: this.defaults.replaces[rType].value
                    })))
                }));
                let values = { wordvalue: "", replacevalue: "", choice: "blocked" };
                settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                    title: `Add new blocked/censored word or deadname`,
                    collapseStates: collapseStates,
                    children: [
                        BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                            type: "Button",
                            label: "Pick a wordvalue and replacevalue:",
                            key: "ADDBUTTON",
                            disabled: !Object.keys(values).every(valuename => values[valuename]),
                            children: BDFDB.LanguageUtils.LanguageStrings.ADD,
                            onClick: _ => {
                                this.saveWord(values);
                                BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
                            }
                        }),
                        this.createInputs(values)
                    ].flat(10).filter(n => n)
                }));
                for (let rType in replaces)
                    if (!BDFDB.ObjectUtils.isEmpty(words[rType])) settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                        title: `Added ${rType} words`,
                        collapseStates: collapseStates,
                        children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsList, {
                            settings: Object.keys(this.defaults.configs),
                            data: Object.keys(words[rType]).map(wordvalue => Object.assign({}, words[rType][wordvalue], {
                                key: wordvalue,
                                label: wordvalue
                            })),
                            renderLabel: data => BDFDB.ReactUtils.createElement("div", {
                                style: { width: "100%" },
                                children: [
                                    BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                                        value: data.label,
                                        placeholder: data.label,
                                        size: BDFDB.LibraryComponents.TextInput.Sizes.MINI,
                                        maxLength: 100000000000000000000,
                                        onChange: value => {
                                            words[rType][value] = words[rType][data.label];
                                            delete words[rType][data.label];
                                            data.label = value;
                                            BDFDB.DataUtils.save(words, this, "words");
                                        }
                                    }),
                                    BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                                        value: data.replace,
                                        placeholder: data.replace,
                                        size: BDFDB.LibraryComponents.TextInput.Sizes.MINI,
                                        maxLength: 100000000000000000000,
                                        onChange: value => {
                                            words[rType][data.label].replace = value;
                                            BDFDB.DataUtils.save(words, this, "words");
                                        }
                                    })
                                ]
                            }),
                            onCheckboxChange: (value, instance) => {
                                words[rType][instance.props.cardId][instance.props.settingId] = value;
                                BDFDB.DataUtils.save(words, this, "words");
                            },
                            onRemove: (e, instance) => {
                                delete words[rType][instance.props.cardId];
                                BDFDB.DataUtils.save(words, this, "words");
                                BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
                            }
                        })
                    }));
                settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                    title: "Remove All",
                    collapseStates: collapseStates,
                    children: Object.keys(replaces).map(rType => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                        type: "Button",
                        color: BDFDB.LibraryComponents.Button.Colors.RED,
                        label: `Remove all ${rType} words`,
                        onClick: _ => {
                            BDFDB.ModalUtils.confirm(this, `Are you sure you want to remove all ${rType} words?`, _ => {
                                words[rType] = {};
                                BDFDB.DataUtils.remove(this, "words", rType);
                                BDFDB.PluginUtils.refreshSettingsPanel(this, settingsPanel, collapseStates);
                            });
                        },
                        children: BDFDB.LanguageUtils.LanguageStrings.REMOVE
                    }))
                }));
                settingsItems.push(BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.CollapseContainer, {
                    title: "Config Guide",
                    collapseStates: collapseStates,
                    children: [
                        "Case: Will block/censor words while comparing lowercase/uppercase. apple => apple, not APPLE or AppLe",
                        "Not Case: Will block/censor words while ignoring lowercase/uppercase. apple => apple, APPLE and AppLe",
                        "Exact: Will block/censor words that are exactly the selected word. apple => apple, not applepie or pineapple",
                        "Not Exact: Will block/censor all words containing the selected word. apple => apple, applepie and pineapple",
                        "Empty: Ignores the default and set replace word and removes the word/message instead.", [
                            "Regex: Will treat the entered wordvalue as a regular expression. ",
                            BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.Anchor, { href: "https://regexr.com/", children: BDFDB.LanguageUtils.LanguageStrings.HELP + "?" })
                        ],
                        "Smart: Attempts to mimic case and text decoration when replacing words."
                    ].map(string => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormText, {
                        type: BDFDB.LibraryComponents.FormComponents.FormTextTypes.DESCRIPTION,
                        children: string
                    }))
                }));

                return settingsPanel = BDFDB.PluginUtils.createSettingsPanel(this, settingsItems);
            }

            onSettingsClosed() {
                if (this.SettingsUpdated) {
                    delete this.SettingsUpdated;
                    this.forceUpdateAll();
                }
            }

            onSwitch() {
                this.forceUpdateAll();
            }

            forceUpdateAll() {
                settings = BDFDB.DataUtils.get(this, "settings");
                replaces = BDFDB.DataUtils.get(this, "replaces");
                configs = BDFDB.DataUtils.get(this, "configs");

                oldBlockedMessages = {};
                oldCensoredMessages = {};
                oldDeadnameMessages = {};

                BDFDB.PatchUtils.forceAllUpdates(this);
                BDFDB.MessageUtils.rerenderAll();
            }

            onNativeContextMenu(e) {
                if (e.instance.props.value && e.instance.props.value.trim()) {
                    if ((e.instance.props.type == "NATIVE_TEXT" || e.instance.props.type == "CHANNEL_TEXT_AREA") && settings.addContextMenu) this.injectItem(e, e.instance.props.value.trim());
                }
            }

            onSlateContextMenu(e) {
                let text = document.getSelection().toString().trim();
                if (text && settings.addContextMenu) this.injectItem(e, text);
            }

            onMessageContextMenu(e) {
                let text = document.getSelection().toString().trim();
                if (text && settings.addContextMenu) this.injectItem(e, text);
            }

            injectItem(e, text) {
                let [children, index] = BDFDB.ContextMenuUtils.findItem(e.returnvalue, { id: "devmode-copy-id", group: true });
                children.splice(index > -1 ? index : children.length, 0, BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuGroup, {
                    children: BDFDB.ContextMenuUtils.createItem(BDFDB.LibraryComponents.MenuItems.MenuItem, {
                        label: BDFDB.LanguageUtils.LibraryStringsFormat("add_to", "Hyde"),
                        id: BDFDB.ContextMenuUtils.createItemId(this.name, "add-filter"),
                        action: _ => {
                            this.openAddModal(text.replace(/\n/g, "\\n").replace(/\r/g, "\\r").replace(/\t/g, "\\t"));
                        }
                    })
                }));
            }

            processMessages(e) {
                e.returnvalue.props.children.props.channelStream = [].concat(e.returnvalue.props.children.props.channelStream);
                for (let i in e.returnvalue.props.children.props.channelStream) {
                    let message = e.returnvalue.props.children.props.channelStream[i].content;
                    if (message) {
                        if (BDFDB.ArrayUtils.is(message.attachments)) this.checkMessage(e.returnvalue.props.children.props.channelStream[i], message);
                        else if (BDFDB.ArrayUtils.is(message))
                            for (let j in message) {
                                let childMessage = message[j].content;
                                if (childMessage && BDFDB.ArrayUtils.is(childMessage.attachments)) this.checkMessage(message[j], childMessage);
                            }
                    }
                }
            }

            checkMessage(stream, message) {
                let { blocked, censored, deadname, content, embeds } = this.parseMessage(message);
                let changeMessage = (change, cache) => {
                    if (change) {
                        if (!cache[message.id]) cache[message.id] = new BDFDB.DiscordObjects.Message(message);
                        stream.content.content = content;
                        stream.content.embeds = embeds;
                    } else if (cache[message.id] && Object.keys(message).some(key => !BDFDB.equals(cache[message.id][key], message[key]))) {
                        stream.content.content = cache[message.id].content;
                        stream.content.embeds = cache[message.id].embeds;
                        delete cache[message.id];
                    }
                };
                changeMessage(blocked, oldBlockedMessages);
                changeMessage(censored, oldCensoredMessages);
                changeMessage(deadname, oldDeadnameMessages);
            }

            processMessage(e) {
                let repliedMessage = e.instance.props.childrenRepliedMessage;
                if (repliedMessage && repliedMessage.props && repliedMessage.props.children && repliedMessage.props.children.props && repliedMessage.props.children.props.referencedMessage && repliedMessage.props.children.props.referencedMessage.message && (oldBlockedMessages[repliedMessage.props.children.props.referencedMessage.message.id] || oldCensoredMessages[repliedMessage.props.children.props.referencedMessage.message.id] || oldDeadnameMessages[repliedMessage.props.children.props.referencedMessage.message.id])) {
                    let { blocked, censored, deadname, content, embeds } = this.parseMessage(repliedMessage.props.children.props.referencedMessage.message);
                    repliedMessage.props.children.props.referencedMessage.message = new BDFDB.DiscordObjects.Message(Object.assign({}, repliedMessage.props.children.props.referencedMessage.message, { content, embeds }));
                }
            }

            processMessageContent(e) {
                if (e.instance.props.message) {
                    if (!e.returnvalue) {
                        if (oldBlockedMessages[e.instance.props.message.id]) e.instance.props.className = BDFDB.DOMUtils.formatClassName(e.instance.props.className, BDFDB.disCN._chatfilterblocked);
                        if (oldCensoredMessages[e.instance.props.message.id] && e.instance.props.message.content != oldCensoredMessages[e.instance.props.message.id].content) e.instance.props.className = BDFDB.DOMUtils.formatClassName(e.instance.props.className, BDFDB.disCN._chatfiltercensored);
                        if (oldDeadnameMessages[e.instance.props.message.id] && e.instance.props.message.content != oldDeadnameMessages[e.instance.props.message.id].content) e.instance.props.className = BDFDB.DOMUtils.formatClassName(e.instance.props.className, BDFDB.disCN._chatfiltercensored);
                    } else {
                        if (e.returnvalue.props.children.push) {
                            if (oldBlockedMessages[e.instance.props.message.id]) e.returnvalue.props.children.push(this.createStamp(oldBlockedMessages[e.instance.props.message.id].content, "blocked"));
                            if (oldCensoredMessages[e.instance.props.message.id]) e.returnvalue.props.children.push(this.createStamp(oldCensoredMessages[e.instance.props.message.id].content, "censored"));
                            if (oldDeadnameMessages[e.instance.props.message.id]) e.returnvalue.props.children.push(this.createStamp("deadname", "censored"));
                        } else {
                            if (oldBlockedMessages[e.instance.props.message.id]) e.returnvalue.props.children.props.children.push(this.createStamp(oldBlockedMessages[e.instance.props.message.id].content, "blocked"));
                            if (oldCensoredMessages[e.instance.props.message.id]) e.returnvalue.props.children.props.children.push(this.createStamp(oldCensoredMessages[e.instance.props.message.id].content, "censored"));
                            if (oldDeadnameMessages[e.instance.props.message.id]) e.returnvalue.props.children.props.children.push(this.createStamp("deadname", "censored"))
                        }
                    }
                }
            }

            processEmbed(e) {
                if (e.instance.props.embed && (e.instance.props.embed.censored || e.instance.props.embed.deadname) && (oldCensoredMessages[e.instance.props.embed.message_id] || oldDeadnameMessages[e.instance.props.embed.message_id])) {
                    deadname = Boolean(e.instance.props.embed.deadname)
                    censored = Boolean(e.instance.props.embed.censored)
                    let [children, index] = BDFDB.ReactUtils.findParent(e.returnvalue, {
                        props: [
                            ["className", BDFDB.disCN.embeddescription]
                        ]
                    });
                    if (index > -1) {
                        if (censored) {
                            children[index].props.children.push(this.createStamp(oldCensoredMessages[e.instance.props.embed.message_id].embeds[e.instance.props.embed.index].rawDescription, "censored"));
                        }
                        if (deadname) {
                            children[index].props.children.push(this.createStamp(oldDeadnameMessages[e.instance.props.embed.message_id].embeds[e.instance.props.embed.index].rawDescription, "censored"));
                        }
                    }
                }
            }

            createStamp(tooltipText, label) {
                return BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TooltipContainer, {
                    text: tooltipText,
                    tooltipConfig: { style: "max-width: 400px" },
                    children: BDFDB.ReactUtils.createElement("time", {
                        className: BDFDB.DOMUtils.formatClassName(BDFDB.disCN.messageedited, BDFDB.disCN[`_chatfilter${label}stamp`]),
                        children: `(${label})`
                    })
                });
            }

            parseMessage(message) {
                let blocked = false,
                    censored = false,
                    deadname = false;
                let content = (oldBlockedMessages[message.id] || oldCensoredMessages[message.id] || oldDeadnameMessages[message.id] || {}).content || message.content;
                let embeds = [].concat((oldBlockedMessages[message.id] || oldCensoredMessages[message.id] || oldDeadnameMessages[message.id] || {}).embeds || message.embeds);
                let isContent = content && typeof content == "string";
                if (isContent || embeds.length) {
                    let blockedReplace;
                    for (let bWord in words.blocked) {
                        let compareContent = [isContent && content, embeds.map(e => e.rawDescription)].flat(10).filter(n => n).join(" ");
                        blockedReplace = words.blocked[bWord].empty ? "" : (words.blocked[bWord].replace || replaces.blocked);
                        let reg = this.createReg(bWord, words.blocked[bWord]);
                        if (words.blocked[bWord].regex || bWord.indexOf(" ") > -1) {
                            if (isContent && this.testWord(compareContent, reg)) blocked = true;
                        } else
                            for (let word of compareContent.replace(/([\n\t\r])/g, " $1 ").split(" ")) {
                                if (this.testWord(word, reg)) {
                                    blocked = true;
                                    break;
                                }
                            }
                        if (blocked) break;
                    }
                    if (blocked) return { blocked, censored, deadname, content: blockedReplace, embeds: [] };
                    else {
                        let checkCensor = string => {
                            let singleCensored = false;
                            string = string.replace(/([\n\t\r])/g, " $1 ");
                            for (let cWord in words.censored) {
                                let censoredReplace = words.censored[cWord].empty ? "" : (words.censored[cWord].replace || replaces.censored);
                                let reg = (words.censored[cWord].smart) ? this.createReg(cWord.split("").join("+") + "+", Object.assign({}, words.censored[cWord], { regex: true })) : this.createReg(cWord, words.censored[cWord]);
                                let newString = [];
                                if (cWord.indexOf(" ") > -1) {
                                    if (this.testWord(string, reg)) {
                                        singleCensored = true;
                                        censored = true;
                                        newString = [string.replace(reg, censoredReplace)];
                                    } else newString = [string];
                                } else
                                    for (let word of string.split(" ")) {
                                        if (this.testWord(word, reg)) {
                                            singleCensored = true;
                                            censored = true;

                                            if (words.censored[cWord].smart) {
                                                let censorWord = words.censored[cWord].regex ? cWord.split(/[\.\+\*\?\^\$\(\)\[\]\{\}\|\\]/g).join('') : cWord;

                                                let wordCase = (word.toLowerCase() == word) ? "lower" : ((word.toUpperCase() == word) ? "upper" : (word[0].toUpperCase() == word[0] && word.slice(1).toLowerCase() == word.slice(1) ? "title" : (word[0].toLowerCase() == word[0] && word.slice(1).toUpperCase() == word.slice(1) ? "invtitle" : "lower"))); // Title, iNVTITLE, UPPER, lower (default lower)
                                                let wordDecor = word.toLowerCase() == censorWord.toLowerCase() ? ["normal", null] : (word.toLowerCase() == (`${censorWord.toLowerCase().slice(0, word.split("-")[0])}-${censorWord.toLowerCase()}`) ? ["stutter", word.split("-")[0]] : ((word.startsWith(censorWord)) && (word.slice(censorWord.length - 1).split('').filter((item, pos, self) => { return self.indexOf(item) == pos }).length == 1) ? ["lastletter", word.length - (censorWord.length - 1)] : ["long", word.length - censorWord.length])); // [st-stutter, 2], [lastleterrrrrrrr, 8], [llooonngg, 9], [normal, null]

                                                let postCaseManipulation = (wordCase == "lower" ? censoredReplace.toLowerCase() : (wordCase == "upper" ? censoredReplace.toUpperCase() : (wordCase == "title" ? censoredReplace[0].toUpperCase() + censoredReplace.slice(1).toLowerCase() : (wordCase == "invtitle" ? censoredReplace[0].toLowerCase() + censoredReplace.slice(1).toUpperCase() : censoredReplace))))
                                                let postDecorManipulation = (wordDecor[0] == "stutter" ? `${postCaseManipulation.slice(0, wordDecor[1])}-${postCaseManipulation}` : (wordDecor[0] == "lastletter") ? (postCaseManipulation.slice(0, postCaseManipulation.length - 1) + postCaseManipulation[postCaseManipulation.length - 1].repeat(wordDecor[1])) : (wordDecor[0] == "long" ? stretchString(postCaseManipulation, wordDecor[1] + censoredReplace.length) : postCaseManipulation))

                                                newString.push(postDecorManipulation);
                                            } else {
                                                newString.push(censoredReplace);
                                            }
                                        } else newString.push(word);
                                    }
                                string = newString.join(" ");
                            }
                            for (let dName in words.deadname) {
                                let deadnameReplace = words.deadname[dName].empty ? "" : (words.deadname[dName].replace || replaces.deadname);
                                let reg = (words.deadname[dName].smart) ? this.createReg(`(${dName.split("").join("+")}+)(['s]*)`, Object.assign({}, words.deadname[dName], { regex: true })) : this.createReg(dName, words.deadname[dName]);

                                let newString = [];
                                if (dName.indexOf(" ") > -1) {
                                    if (this.testWord(string, reg)) {
                                        singleCensored = true;
                                        deadname = true;
                                        newString = [string.replace(reg, deadnameReplace)];
                                    } else newString = [string];
                                } else
                                    for (let word of string.split(" ")) {
                                        if (this.testWord(word, reg)) {
                                            singleCensored = true;
                                            deadname = true;
                                            if (words.deadname[dName].smart) {
                                                let regValues = reg.exec(word)
                                                let baseWord = regValues[1]
                                                let possessiveEnding = regValues[2]

                                                let censorWord = words.deadname[dName].regex ? dName.split(/[\.\+\*\?\^\$\(\)\[\]\{\}\|\\]/g).join('') : dName;

                                                let wordCase = (baseWord.toLowerCase() == baseWord) ? "lower" : ((baseWord.toUpperCase() == baseWord) ? "upper" : (baseWord[0].toUpperCase() == baseWord[0] && baseWord.slice(1).toLowerCase() == baseWord.slice(1) ? "title" : (baseWord[0].toLowerCase() == baseWord[0] && baseWord.slice(1).toUpperCase() == baseWord.slice(1) ? "invtitle" : "lower"))); // Title, iNVTITLE, UPPER, lower (default lower)
                                                let wordDecor = baseWord.toLowerCase() == censorWord.toLowerCase() ? ["normal", null] : (baseWord.toLowerCase() == (`${censorWord.toLowerCase().slice(0, baseWord.split("-")[0])}-${censorWord.toLowerCase()}`) ? ["stutter", baseWord.split("-")[0]] : ((baseWord.startsWith(censorWord)) && (baseWord.slice(censorWord.length - 1).split('').filter((item, pos, self) => { return self.indexOf(item) == pos }).length == 1) ? ["lastletter", baseWord.length - (censorWord.length - 1)] : ["long", baseWord.length - censorWord.length])); // [st-stutter, 2], [lastleterrrrrrrr, 8], [llooonngg, 5], [normal, null]

                                                let postCaseManipulation = (wordCase == "lower" ? deadnameReplace.toLowerCase() : (wordCase == "upper" ? deadnameReplace.toUpperCase() : (wordCase == "title" ? deadnameReplace[0].toUpperCase() + deadnameReplace.slice(1).toLowerCase() : (wordCase == "invtitle" ? deadnameReplace[0].toLowerCase() + deadnameReplace.slice(1).toUpperCase() : deadnameReplace))))
                                                let postDecorManipulation = (wordDecor[0] == "stutter" ? `${postCaseManipulation.slice(0, wordDecor[1])}-${postCaseManipulation}` : (wordDecor[0] == "lastletter") ? (postCaseManipulation.slice(0, postCaseManipulation.length - 1) + postCaseManipulation[postCaseManipulation.length - 1].repeat(wordDecor[1])) : (wordDecor[0] == "long" ? stretchString(postCaseManipulation, wordDecor[1] + deadnameReplace.length) : postCaseManipulation))
                                                let postPossessiveEnding = postDecorManipulation + possessiveEnding
                                                newString.push(postPossessiveEnding);
                                            } else {
                                                newString.push(deadnameReplace);
                                            }
                                        } else newString.push(word);
                                    }
                                string = newString.join(" ");
                            }
                            return { parsedContent: string.replace(/ ([\n\t\r]) /g, "$1"), singleCensored: singleCensored };
                        };
                        if (isContent) {
                            let { parsedContent, singleCensored } = checkCensor(content);
                            if (singleCensored) content = parsedContent;
                        }
                        for (let i in embeds)
                            if (embeds[i].rawDescription) {
                                let { parsedContent, singleCensored } = checkCensor(embeds[i].rawDescription);
                                if (singleCensored) embeds[i] = Object.assign({}, embeds[i], { rawDescription: parsedContent, index: i, message_id: message.id, censored: true });
                            }
                    }
                }
                return { blocked, censored, deadname, content, embeds };
            }

            testWord(word, reg) {
                let nativeEmoji = BDFDB.LibraryModules.EmojiUtils.translateSurrogatesToInlineEmoji(word);
                if (nativeEmoji != word) return this.regTest(nativeEmoji, reg);
                else {
                    let customEmoji = (/<a{0,1}(:.*:)[0-9]{7,}>/i.exec(word) || [])[1];
                    if (customEmoji) return this.regTest(customEmoji, reg);
                    else return this.regTest(word, reg);
                }
            }

            regTest(word, reg) {
                let wordWithoutSpecial = word.replace(/[\?\¿\!\¡\.\"\*\-\_\~]/g, "");
                return word && reg.test(word) || wordWithoutSpecial && reg.test(wordWithoutSpecial);
            }

            createReg(word, config) {
                let escapedWord = config.regex ? word : BDFDB.StringUtils.regEscape(word);
                return new RegExp(BDFDB.StringUtils.htmlEscape(config.exact ? "^" + escapedWord + "$" : escapedWord), `${config.case ? "" : "i"}${config.exact ? "" : "g"}`);
            }

            openAddModal(wordvalue) {
                let values = { wordvalue, replacevalue: "", choice: "blocked" };
                BDFDB.ModalUtils.open(this, {
                    size: "MEDIUM",
                    header: BDFDB.LanguageUtils.LibraryStringsFormat("add_to", "Hyde"),
                    subheader: "",
                    children: [
                        this.createInputs(values),
                        BDFDB.ArrayUtils.remove(Object.keys(this.defaults.configs), "file").map(key => BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.SettingsItem, {
                            type: "Switch",
                            className: "input-config" + key,
                            label: this.defaults.configs[key].description,
                            value: this.defaults.configs[key].value
                        }))
                    ].flat(10).filter(n => n),
                    buttons: [{
                        key: "ADDBUTTON",
                        disabled: !values.wordvalue,
                        contents: BDFDB.LanguageUtils.LanguageStrings.ADD,
                        color: "BRAND",
                        close: true,
                        click: modal => {
                            let newConfigs = {};
                            for (let key in this.defaults.configs) {
                                let configInput = modal.querySelector(`.input-config${key} ${BDFDB.dotCN.switchinner}`);
                                if (configInput) newConfigs[key] = configInput.checked;
                            }
                            this.saveWord(values, newConfigs);
                            this.forceUpdateAll();
                        }
                    }]
                });
            }

            createInputs(values) {
                return [
                    BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
                        title: "Replace:",
                        className: BDFDB.disCN.marginbottom8,
                        children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                            key: "WORDVALUE",
                            value: values.wordvalue,
                            placeholder: values.wordvalue,
                            errorMessage: !values.wordvalue && "Choose a wordvalue" || words[values.choice][values.wordvalue] && `Wordvalue already used, saving will overwrite old ${values.choice} word`,
                            onChange: (value, instance) => {
                                values.wordvalue = value.trim();
                                if (!values.wordvalue) instance.props.errorMessage = "Choose a wordvalue";
                                else if (words[values.choice][values.wordvalue]) instance.props.errorMessage = `Wordvalue already used, saving will overwrite old ${values.choice} word`;
                                else delete instance.props.errorMessage;
                                let addButtonIns = BDFDB.ReactUtils.findOwner(BDFDB.ReactUtils.findOwner(instance, { name: ["BDFDB_Modal", "BDFDB_SettingsPanel"], up: true }), { key: "ADDBUTTON" });
                                if (addButtonIns) {
                                    addButtonIns.props.disabled = !values.wordvalue;
                                    BDFDB.ReactUtils.forceUpdate(addButtonIns);
                                }
                            }
                        })
                    }),
                    BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.FormComponents.FormItem, {
                        title: "With:",
                        className: BDFDB.disCN.marginbottom8,
                        children: BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.TextInput, {
                            value: values.replacevalue,
                            placeholder: values.replacevalue,
                            autoFocus: true,
                            onChange: (value, instance) => {
                                values.replacevalue = value.trim();
                            }
                        })
                    }),
                    BDFDB.ReactUtils.createElement(BDFDB.LibraryComponents.RadioGroup, {
                        className: BDFDB.disCN.marginbottom8,
                        value: values.choice,
                        options: [{ value: "blocked", name: "Blocked Term" }, { value: "censored", name: "Censored Term" }, { value: "deadname", name: "Deadname" }],
                        onChange: (value, instance) => {
                            values.choice = value.value;
                            let wordvalueInputIns = BDFDB.ReactUtils.findOwner(BDFDB.ReactUtils.findOwner(instance, { name: ["BDFDB_Modal", "BDFDB_SettingsPanel"], up: true }), { key: "WORDVALUE" });
                            if (wordvalueInputIns) {
                                if (!values.wordvalue) wordvalueInputIns.props.errorMessage = "Choose a wordvalue";
                                else if (words[values.choice][values.wordvalue]) wordvalueInputIns.props.errorMessage = `Wordvalue already used, saving will overwrite old ${values.choice} word`;
                                else delete wordvalueInputIns.props.errorMessage;
                                BDFDB.ReactUtils.forceUpdate(wordvalueInputIns);
                            }
                        }
                    })
                ];
            }

            saveWord(values, wordConfigs = configs) {
                if (!values.wordvalue || !values.choice) return;
                values.wordvalue = values.wordvalue.trim();
                values.replacevalue = values.replacevalue.trim();
                if (!BDFDB.ObjectUtils.is(words[values.choice])) words[values.choice] = {};
                words[values.choice][values.wordvalue] = {
                    replace: values.replacevalue,
                    empty: wordConfigs.empty,
                    case: wordConfigs.case,
                    exact: values.wordvalue.indexOf(" ") > -1 ? false : wordConfigs.exact,
                    regex: false,
                    smart: values.choice != "blocked" ? wordConfigs.smart : false
                };
                BDFDB.DataUtils.save(words, this, "words");
            }
        };
    })(window.BDFDB_Global.PluginUtils.buildPlugin(config));
})();