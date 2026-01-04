import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Text, useStdout, useInput } from 'ink'
import { MessageBuffer, type BufferedMessage } from './messageBuffer'

type PermissionMode = 'default' | 'read-only' | 'safe-yolo' | 'yolo'

type CodexSettings = {
    model?: string
    permissionMode?: PermissionMode
    profile?: string
    reasoningEffort?: string
}

type CodexModelHints = {
    defaultModel?: string
    migratedModel?: string
    defaultReasoningEffort?: string
    profiles?: string[]
}

interface CodexDisplayProps {
    messageBuffer: MessageBuffer
    logPath?: string
    onExit?: () => void
    settings?: CodexSettings
    modelHints?: CodexModelHints
    initialShowSettings?: boolean
    onUpdateSettings?: (settings: CodexSettings) => void | Promise<void>
}

export const CodexDisplay: React.FC<CodexDisplayProps> = ({
    messageBuffer,
    logPath,
    onExit,
    settings,
    modelHints,
    initialShowSettings,
    onUpdateSettings,
}) => {
    const [messages, setMessages] = useState<BufferedMessage[]>([])
    const [confirmationMode, setConfirmationMode] = useState<boolean>(false)
    const [actionInProgress, setActionInProgress] = useState<boolean>(false)
    const [actionLabel, setActionLabel] = useState<string | null>(null)
    const confirmationTimeoutRef = useRef<NodeJS.Timeout | null>(null)
    const { stdout } = useStdout()
    const terminalWidth = stdout.columns || 80
    const terminalHeight = stdout.rows || 24

    const [settingsOpen, setSettingsOpen] = useState<boolean>(() => Boolean(initialShowSettings))
    const [settingsSelection, setSettingsSelection] = useState<number>(0)
    const [activePicker, setActivePicker] = useState<null | 'model' | 'profile' | 'reasoningEffort'>(null)
    const [pickerSelection, setPickerSelection] = useState<number>(0)
    const [editingField, setEditingField] = useState<'model' | 'profile' | 'reasoningEffort' | null>(null)
    const [draftPermissionMode, setDraftPermissionMode] = useState<PermissionMode>(() => settings?.permissionMode || 'default')
    const [draftModel, setDraftModel] = useState<string>(() => settings?.model || '')
    const [draftProfile, setDraftProfile] = useState<string>(() => settings?.profile || '')
    const [draftReasoningEffort, setDraftReasoningEffort] = useState<string>(() => settings?.reasoningEffort || '')
    const [draftTextInput, setDraftTextInput] = useState<string>('')

    const permissionModeOptions: Array<{ value: PermissionMode; label: string; description: string }> = [
        {
            value: 'default',
            label: 'default',
            description: 'Asks for permission for most actions (recommended).'
        },
        {
            value: 'read-only',
            label: 'read-only',
            description: 'Read-only sandbox; write actions should fail.'
        },
        {
            value: 'safe-yolo',
            label: 'safe-yolo',
            description: 'Runs without prompting in a sandbox; may still ask to escalate on failure.'
        },
        {
            value: 'yolo',
            label: 'yolo',
            description: 'Full access: no sandbox and no approval prompts.'
        }
    ]

    const settingsItems = [
        { key: 'permissionMode' as const, label: 'Permission mode' },
        { key: 'model' as const, label: 'Model' },
        { key: 'reasoningEffort' as const, label: 'Thinking mode' },
        { key: 'profile' as const, label: 'Profile' },
        { key: 'save' as const, label: 'Save & close' },
        { key: 'cancel' as const, label: 'Cancel' },
    ]

    const openSettings = useCallback((initial?: CodexSettings) => {
        const base = initial || {}
        setDraftPermissionMode(base.permissionMode || 'default')
        setDraftModel(base.model || '')
        setDraftReasoningEffort(base.reasoningEffort || '')
        setDraftProfile(base.profile || '')
        setDraftTextInput('')
        setEditingField(null)
        setActivePicker(null)
        setPickerSelection(0)
        setSettingsSelection(0)
        setSettingsOpen(true)
    }, [])

    const closeSettings = useCallback(() => {
        setSettingsOpen(false)
        setEditingField(null)
        setActivePicker(null)
        setDraftTextInput('')
    }, [])

    useEffect(() => {
        setMessages(messageBuffer.getMessages())
        
        const unsubscribe = messageBuffer.onUpdate((newMessages) => {
            setMessages(newMessages)
        })

        return () => {
            unsubscribe()
            if (confirmationTimeoutRef.current) {
                clearTimeout(confirmationTimeoutRef.current)
            }
        }
    }, [messageBuffer])

    useEffect(() => {
        if (settingsOpen) return
        setDraftPermissionMode(settings?.permissionMode || 'default')
        setDraftModel(settings?.model || '')
        setDraftReasoningEffort(settings?.reasoningEffort || '')
        setDraftProfile(settings?.profile || '')
    }, [settingsOpen, settings?.permissionMode, settings?.model, settings?.reasoningEffort, settings?.profile])

    const resetConfirmation = useCallback(() => {
        setConfirmationMode(false)
        if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current)
            confirmationTimeoutRef.current = null
        }
    }, [])

    const setConfirmationWithTimeout = useCallback(() => {
        setConfirmationMode(true)
        if (confirmationTimeoutRef.current) {
            clearTimeout(confirmationTimeoutRef.current)
        }
        confirmationTimeoutRef.current = setTimeout(() => {
            resetConfirmation()
        }, 15000) // 15 seconds timeout
    }, [resetConfirmation])

    const cyclePermissionMode = useCallback(() => {
        const index = permissionModeOptions.findIndex(opt => opt.value === draftPermissionMode)
        const next = permissionModeOptions[(index + 1) % permissionModeOptions.length]
        setDraftPermissionMode(next.value)
    }, [draftPermissionMode, permissionModeOptions])

    const normalizeSettings = useCallback((): CodexSettings => ({
        permissionMode: draftPermissionMode,
        model: draftModel.trim() ? draftModel.trim() : undefined,
        reasoningEffort: draftReasoningEffort.trim() ? draftReasoningEffort.trim() : undefined,
        profile: draftProfile.trim() ? draftProfile.trim() : undefined,
    }), [draftPermissionMode, draftModel, draftReasoningEffort, draftProfile])

    type PickerOption = { value: string; label: string; description?: string }
    const CUSTOM_PICKER_VALUE = '__custom__'

    const getModelPickerOptions = useCallback((): PickerOption[] => {
        const options: PickerOption[] = []
        const seen = new Set<string>()
        const pushUnique = (opt: PickerOption) => {
            if (seen.has(opt.value)) return
            seen.add(opt.value)
            options.push(opt)
        }

        const codexDefault = modelHints?.defaultModel
        const codexSuggested = modelHints?.migratedModel
        pushUnique({
            value: '',
            label: '(default)',
            description: codexDefault ? `Uses Codex default (${codexDefault}).` : 'Uses Codex default.'
        })
        if (codexSuggested) {
            pushUnique({ value: codexSuggested, label: codexSuggested, description: 'Suggested by Codex migration notices.' })
        }
        if (codexDefault) {
            pushUnique({ value: codexDefault, label: codexDefault, description: 'Current Codex default model.' })
        }

        const current = draftModel.trim()
        if (current) {
            pushUnique({ value: current, label: `${current} (current)`, description: 'Your current selection.' })
        }

        pushUnique({ value: CUSTOM_PICKER_VALUE, label: 'Custom…', description: 'Type a model name manually.' })
        return options
    }, [draftModel, modelHints])

    const getProfilePickerOptions = useCallback((): PickerOption[] => {
        const options: PickerOption[] = []
        const seen = new Set<string>()
        const pushUnique = (opt: PickerOption) => {
            if (seen.has(opt.value)) return
            seen.add(opt.value)
            options.push(opt)
        }

        const profiles = modelHints?.profiles || []
        pushUnique({ value: '', label: '(default)', description: 'Uses Codex default profile.' })
        for (const profileName of profiles) {
            pushUnique({ value: profileName, label: profileName })
        }

        const current = draftProfile.trim()
        if (current) {
            pushUnique({ value: current, label: `${current} (current)` })
        }

        pushUnique({ value: CUSTOM_PICKER_VALUE, label: 'Custom…', description: 'Type a profile name manually.' })
        return options
    }, [draftProfile, modelHints])

    const getReasoningEffortPickerOptions = useCallback((): PickerOption[] => {
        const options: PickerOption[] = []
        const seen = new Set<string>()
        const pushUnique = (opt: PickerOption) => {
            if (seen.has(opt.value)) return
            seen.add(opt.value)
            options.push(opt)
        }

        const codexDefault = modelHints?.defaultReasoningEffort
        pushUnique({
            value: '',
            label: '(default)',
            description: codexDefault ? `Uses Codex default (${codexDefault}).` : 'Uses Codex default.'
        })
        for (const value of ['low', 'medium', 'high', 'xhigh'] as const) {
            pushUnique({ value, label: value })
        }
        if (codexDefault) {
            pushUnique({ value: codexDefault, label: `${codexDefault} (default)` })
        }

        const current = draftReasoningEffort.trim()
        if (current) {
            pushUnique({ value: current, label: `${current} (current)` })
        }

        pushUnique({ value: CUSTOM_PICKER_VALUE, label: 'Custom…', description: 'Type a reasoning effort value manually.' })
        return options
    }, [draftReasoningEffort, modelHints])

    const openPicker = useCallback((picker: NonNullable<typeof activePicker>) => {
        const options = picker === 'model'
            ? getModelPickerOptions()
            : picker === 'profile'
                ? getProfilePickerOptions()
                : getReasoningEffortPickerOptions()

        const currentValue = picker === 'model'
            ? draftModel.trim()
            : picker === 'profile'
                ? draftProfile.trim()
                : draftReasoningEffort.trim()

        const index = options.findIndex(opt => opt.value === currentValue)
        setPickerSelection(index >= 0 ? index : 0)
        setActivePicker(picker)
    }, [
        activePicker,
        draftModel,
        draftProfile,
        draftReasoningEffort,
        getModelPickerOptions,
        getProfilePickerOptions,
        getReasoningEffortPickerOptions,
    ])

    useInput(useCallback(async (input, key) => {
        // Don't process input if action is in progress
        if (actionInProgress) return
        
        // Handle Ctrl-C - exits the agent directly instead of switching modes
        if (key.ctrl && input === 'c') {
            if (confirmationMode) {
                // Second Ctrl-C, exit
                resetConfirmation()
                setActionInProgress(true)
                // Small delay to show the status message
                await new Promise(resolve => setTimeout(resolve, 100))
                onExit?.()
            } else {
                // First Ctrl-C, show confirmation
                setConfirmationWithTimeout()
            }
            return
        }

        // Settings toggle / handler
        if (settingsOpen) {
            // Editing text field
            if (editingField) {
                if (key.escape) {
                    setEditingField(null)
                    setDraftTextInput('')
                    return
                }
                if (key.return) {
                    const value = draftTextInput
                    if (editingField === 'model') {
                        setDraftModel(value)
                    } else if (editingField === 'profile') {
                        setDraftProfile(value)
                    } else if (editingField === 'reasoningEffort') {
                        setDraftReasoningEffort(value)
                    }
                    setEditingField(null)
                    setDraftTextInput('')
                    return
                }
                if (key.backspace || key.delete) {
                    setDraftTextInput(prev => prev.slice(0, -1))
                    return
                }
                if (typeof input === 'string' && input.length > 0 && !key.ctrl && !key.meta) {
                    setDraftTextInput(prev => prev + input)
                }
                return
            }

            // Picker (model/profile/reasoning effort)
            if (activePicker) {
                const options = activePicker === 'model'
                    ? getModelPickerOptions()
                    : activePicker === 'profile'
                        ? getProfilePickerOptions()
                        : getReasoningEffortPickerOptions()

                if (key.escape || input === 's') {
                    setActivePicker(null)
                    return
                }
                if (key.upArrow) {
                    setPickerSelection(prev => (prev - 1 + options.length) % options.length)
                    return
                }
                if (key.downArrow) {
                    setPickerSelection(prev => (prev + 1) % options.length)
                    return
                }
                if (key.return) {
                    const choice = options[pickerSelection]
                    if (!choice) {
                        setActivePicker(null)
                        return
                    }

                    if (choice.value === CUSTOM_PICKER_VALUE) {
                        setEditingField(activePicker)
                        if (activePicker === 'model') setDraftTextInput(draftModel)
                        if (activePicker === 'profile') setDraftTextInput(draftProfile)
                        if (activePicker === 'reasoningEffort') setDraftTextInput(draftReasoningEffort)
                        setActivePicker(null)
                        return
                    }

                    if (activePicker === 'model') {
                        setDraftModel(choice.value)
                    } else if (activePicker === 'profile') {
                        setDraftProfile(choice.value)
                    } else if (activePicker === 'reasoningEffort') {
                        setDraftReasoningEffort(choice.value)
                    }

                    setActivePicker(null)
                    return
                }

                return
            }

            // Non-editing settings navigation
            if (key.escape || input === 's') {
                closeSettings()
                return
            }
            if (key.upArrow) {
                setSettingsSelection(prev => (prev - 1 + settingsItems.length) % settingsItems.length)
                return
            }
            if (key.downArrow) {
                setSettingsSelection(prev => (prev + 1) % settingsItems.length)
                return
            }

            // Quick-select permission modes with number keys
            if (['1', '2', '3', '4'].includes(input)) {
                const idx = parseInt(input, 10) - 1
                if (permissionModeOptions[idx]) {
                    setDraftPermissionMode(permissionModeOptions[idx].value)
                }
                return
            }

            if (key.return) {
                const selected = settingsItems[settingsSelection]?.key
                if (selected === 'permissionMode') {
                    cyclePermissionMode()
                    return
                }
                if (selected === 'model') {
                    openPicker('model')
                    return
                }
                if (selected === 'reasoningEffort') {
                    openPicker('reasoningEffort')
                    return
                }
                if (selected === 'profile') {
                    openPicker('profile')
                    return
                }
                if (selected === 'cancel') {
                    closeSettings()
                    return
                }
                if (selected === 'save') {
                    const next = normalizeSettings()
                    if (!onUpdateSettings) {
                        closeSettings()
                        return
                    }
                    setActionInProgress(true)
                    setActionLabel('Saving settings...')
                    try {
                        await onUpdateSettings(next)
                        messageBuffer.addMessage('Saved Codex settings.', 'system')
                        closeSettings()
                    } catch (error) {
                        messageBuffer.addMessage(
                            `Failed to save settings: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            'system'
                        )
                    } finally {
                        setActionInProgress(false)
                        setActionLabel(null)
                    }
                    return
                }
            }

            return
        }

        if (input === 's') {
            openSettings(settings)
            return
        }

        // Any other key cancels confirmation
        if (confirmationMode) {
            resetConfirmation()
        }
    }, [
        activePicker,
        actionInProgress,
        actionLabel,
        closeSettings,
        confirmationMode,
        cyclePermissionMode,
        draftModel,
        draftProfile,
        draftReasoningEffort,
        draftTextInput,
        editingField,
        getModelPickerOptions,
        getProfilePickerOptions,
        getReasoningEffortPickerOptions,
        messageBuffer,
        normalizeSettings,
        onExit,
        onUpdateSettings,
        openPicker,
        openSettings,
        pickerSelection,
        permissionModeOptions,
        resetConfirmation,
        setConfirmationWithTimeout,
        settings,
        settingsItems,
        settingsOpen,
        settingsSelection,
    ]))

    const getMessageColor = (type: BufferedMessage['type']): string => {
        switch (type) {
            case 'user': return 'magenta'
            case 'assistant': return 'cyan'
            case 'system': return 'blue'
            case 'tool': return 'yellow'
            case 'result': return 'green'
            case 'status': return 'gray'
            default: return 'white'
        }
    }

    const formatMessage = (msg: BufferedMessage): string => {
        const lines = msg.content.split('\n')
        const maxLineLength = terminalWidth - 10 // Account for borders and padding
        return lines.map(line => {
            if (line.length <= maxLineLength) return line
            const chunks: string[] = []
            for (let i = 0; i < line.length; i += maxLineLength) {
                chunks.push(line.slice(i, i + maxLineLength))
            }
            return chunks.join('\n')
        }).join('\n')
    }

    const currentSelectedPermissionMode = permissionModeOptions.find(opt => opt.value === draftPermissionMode)

    const renderSettings = () => {
        const selectedKey = settingsItems[settingsSelection]?.key
        const currentPickerSelection = Math.max(0, pickerSelection)

        const valueFor = (key: typeof settingsItems[number]['key']): string => {
            if (key === 'permissionMode') return draftPermissionMode
            if (key === 'model') return draftModel.trim() ? draftModel : '(default)'
            if (key === 'reasoningEffort') return draftReasoningEffort.trim() ? draftReasoningEffort : '(default)'
            if (key === 'profile') return draftProfile.trim() ? draftProfile : '(default)'
            return ''
        }

        const modelHintText = (() => {
            const bits: string[] = ['Enter to choose from a list, or pick Custom to type.']
            if (modelHints?.defaultModel) {
                bits.push(`Codex default: ${modelHints.defaultModel}`)
            }
            if (modelHints?.migratedModel) {
                bits.push(`Suggested: ${modelHints.migratedModel}`)
            }
            return bits.join(' ')
        })()

        const reasoningHintText = (() => {
            const bits: string[] = ['Enter to choose thinking mode (reasoning effort).']
            if (modelHints?.defaultReasoningEffort) {
                bits.push(`Codex default: ${modelHints.defaultReasoningEffort}`)
            }
            bits.push('Options: low | medium | high | xhigh.')
            return bits.join(' ')
        })()

        const profileHintText = (() => {
            const profiles = modelHints?.profiles || []
            if (profiles.length === 0) {
                return 'Enter to choose a profile (none detected). Leave default unless you created one in Codex config.'
            }
            const preview = profiles.slice(0, 3).join(', ')
            const suffix = profiles.length > 3 ? '…' : ''
            return `Enter to choose a profile. Detected: ${preview}${suffix}`
        })()

        const renderPicker = () => {
            const pickerTitle = activePicker === 'model'
                ? 'Choose model'
                : activePicker === 'profile'
                    ? 'Choose profile'
                    : 'Choose thinking mode'

            const options = activePicker === 'model'
                ? getModelPickerOptions()
                : activePicker === 'profile'
                    ? getProfilePickerOptions()
                    : getReasoningEffortPickerOptions()

            const safeIndex = Math.min(currentPickerSelection, Math.max(0, options.length - 1))
            const focused = options[safeIndex]

            return (
                <Box flexDirection="column">
                    <Box flexDirection="column" marginBottom={1}>
                        <Text bold color="cyan">{pickerTitle}</Text>
                        <Text color="gray" dimColor>↑/↓ to choose • Enter to select • Esc to go back</Text>
                    </Box>

                    <Box flexDirection="column" marginBottom={1}>
                        {options.map((opt, idx) => {
                            const selected = idx === safeIndex
                            const prefix = selected ? '› ' : '  '
                            return (
                                <Text key={`${activePicker}-${opt.value || 'default'}-${idx}`} color={selected ? 'yellow' : 'white'} bold={selected}>
                                    {prefix}{opt.label}
                                </Text>
                            )
                        })}
                    </Box>

                    <Box flexDirection="column">
                        <Text color="gray" dimColor>{'─'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                        {focused?.description ? (
                            <Text color="gray" dimColor>{focused.description}</Text>
                        ) : null}
                        {activePicker === 'model' ? (
                            <Text color="gray" dimColor>{modelHintText}</Text>
                        ) : activePicker === 'reasoningEffort' ? (
                            <Text color="gray" dimColor>{reasoningHintText}</Text>
                        ) : activePicker === 'profile' ? (
                            <Text color="gray" dimColor>{profileHintText}</Text>
                        ) : null}
                    </Box>
                </Box>
            )
        }

        if (activePicker) {
            return renderPicker()
        }

        const helpText = (() => {
            if (editingField === 'model') return `Editing model: Enter to save • Esc to cancel • ${modelHintText}`
            if (editingField === 'reasoningEffort') return `Editing thinking mode: Enter to save • Esc to cancel • ${reasoningHintText}`
            if (editingField === 'profile') return 'Editing profile: Enter to save • Esc to cancel'
            if (selectedKey === 'permissionMode') return currentSelectedPermissionMode?.description || ''
            if (selectedKey === 'model') return modelHintText
            if (selectedKey === 'reasoningEffort') return reasoningHintText
            if (selectedKey === 'profile') return profileHintText
            if (selectedKey === 'save') return 'Applies these defaults for new turns/sessions.'
            return 'Esc or s to close without saving.'
        })()

        return (
            <Box flexDirection="column">
                <Box flexDirection="column" marginBottom={1}>
                    <Text bold color="cyan">Settings</Text>
                    <Text color="gray" dimColor>↑/↓ to navigate • Enter to edit • Esc to close</Text>
                </Box>

                <Box flexDirection="column" marginBottom={1}>
                    {settingsItems.map((item, idx) => {
                        const selected = idx === settingsSelection
                        const prefix = selected ? '› ' : '  '

                        const isEditingThis =
                            (item.key === 'model' && editingField === 'model') ||
                            (item.key === 'reasoningEffort' && editingField === 'reasoningEffort') ||
                            (item.key === 'profile' && editingField === 'profile')

                        const value = isEditingThis ? `${draftTextInput}_` : valueFor(item.key)
                        const line = item.key === 'save' || item.key === 'cancel'
                            ? `${prefix}${item.label}`
                            : `${prefix}${item.label}: ${value}`

                        return (
                            <Text key={item.key} color={selected ? 'yellow' : 'white'} bold={selected}>
                                {line}
                            </Text>
                        )
                    })}
                </Box>

                {helpText ? (
                    <Box flexDirection="column">
                        <Text color="gray" dimColor>{'─'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                        <Text color="gray" dimColor>{helpText}</Text>
                        {selectedKey === 'permissionMode' && draftPermissionMode === 'yolo' ? (
                            <Text color="red" bold>
                                Warning: yolo disables sandboxing and approvals.
                            </Text>
                        ) : null}
                        {selectedKey === 'permissionMode' ? (
                            <Text color="gray" dimColor>Tip: press 1–4 to pick a mode quickly.</Text>
                        ) : null}
                    </Box>
                ) : null}
            </Box>
        )
    }

    return (
        <Box flexDirection="column" width={terminalWidth} height={terminalHeight}>
            {/* Main content area with logs */}
            <Box 
                flexDirection="column" 
                width={terminalWidth}
                height={terminalHeight - 4}
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                overflow="hidden"
            >
                <Box flexDirection="column" marginBottom={1}>
                    <Text color="gray" bold>🤖 Codex Agent Messages</Text>
                    <Text color="gray" dimColor>{'─'.repeat(Math.min(terminalWidth - 4, 60))}</Text>
                </Box>
                
                <Box flexDirection="column" height={terminalHeight - 10} overflow="hidden">
                    {settingsOpen ? (
                        renderSettings()
                    ) : messages.length === 0 ? (
                        <Text color="gray" dimColor>Waiting for messages...</Text>
                    ) : (
                        // Show only the last messages that fit in the available space
                        messages.slice(-Math.max(1, terminalHeight - 10)).map((msg) => (
                            <Box key={msg.id} flexDirection="column" marginBottom={1}>
                                <Text color={getMessageColor(msg.type)} dimColor>
                                    {formatMessage(msg)}
                                </Text>
                            </Box>
                        ))
                    )}
                </Box>
            </Box>

            {/* Modal overlay at the bottom */}
            <Box 
                width={terminalWidth}
                borderStyle="round"
                borderColor={
                    actionInProgress ? "gray" :
                    confirmationMode ? "red" : 
                    "green"
                }
                paddingX={2}
                justifyContent="center"
                alignItems="center"
                flexDirection="column"
            >
                <Box flexDirection="column" alignItems="center">
                    {actionInProgress ? (
                        <Text color="gray" bold>
                            {actionLabel || 'Working...'}
                        </Text>
                    ) : settingsOpen ? (
                        <Text color="yellow" bold>
                            {activePicker ? 'Settings • Enter to select • Esc to go back' : 'Settings • Enter to select • Esc to close'}
                        </Text>
                    ) : confirmationMode ? (
                        <Text color="red" bold>
                            ⚠️  Press Ctrl-C again to exit the agent
                        </Text>
                    ) : (
                        <>
                            <Text color="green" bold>
                                🤖 Codex Agent Running • s Settings • Ctrl-C to exit
                            </Text>
                        </>
                    )}
                    {process.env.DEBUG && logPath && (
                        <Text color="gray" dimColor>
                            Debug logs: {logPath}
                        </Text>
                    )}
                </Box>
            </Box>
        </Box>
    )
}
