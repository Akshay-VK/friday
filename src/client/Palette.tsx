import { useEffect, useId, useRef, useState } from 'react'
import { searchActions } from './api.ts'
import { PaletteIcon, SearchIcon } from './icons.tsx'
import type { RegisteredUiAction } from './registry.ts'

export type CommandPaletteProps = {
  open: boolean
  actions: RegisteredUiAction[]
  onClose: () => void
  onInvoke: (actionId: string) => void
}

export function CommandPalette({
  open,
  actions,
  onClose,
  onInvoke,
}: CommandPaletteProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const [query, setQuery] = useState('')
  const [visible, setVisible] = useState<RegisteredUiAction[]>(actions)
  const [activeIndex, setActiveIndex] = useState(0)
  const [searching, setSearching] = useState(false)
  const [notice, setNotice] = useState('')

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open) {
      if (!dialog.open) dialog.showModal()
      setQuery('')
      setVisible(actions)
      setActiveIndex(0)
      setNotice('')
      inputRef.current?.focus()
    } else if (dialog.open) {
      dialog.close()
    }
  }, [open, actions])

  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length === 0) {
      setVisible(actions)
      setSearching(false)
      setActiveIndex(0)
      return
    }

    let cancelled = false
    setSearching(true)
    const timer = setTimeout(() => {
      void searchActions(trimmed)
        .then((payload) => {
          if (cancelled) return
          const matches = payload.results
            .map((result) => actions.find((action) => action.id === result.id))
            .filter((action): action is RegisteredUiAction => Boolean(action))
          setVisible(matches)
          setActiveIndex(0)
          setNotice('')
        })
        .catch(() => {
          if (cancelled) return
          setVisible([])
          setNotice('The local search index did not answer.')
        })
        .finally(() => {
          if (!cancelled) setSearching(false)
        })
    }, 120)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, actions])

  function move(direction: 1 | -1) {
    if (visible.length === 0) return
    setActiveIndex(
      (current) => (current + direction + visible.length) % visible.length,
    )
  }

  function invokeActive() {
    const action = visible[activeIndex]
    if (!action) return
    onInvoke(action.id)
  }

  return (
    <dialog
      ref={dialogRef}
      className="palette"
      aria-label="Command palette"
      onCancel={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div className="palette__bar">
        <SearchIcon className="palette__search-icon" />
        <input
          ref={inputRef}
          className="palette__input"
          type="text"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={
            visible[activeIndex] ? `${listId}-option-${activeIndex}` : undefined
          }
          aria-label="Search commands"
          placeholder="Search commands, e.g. about"
          autoComplete="off"
          spellCheck={false}
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              move(1)
            } else if (event.key === 'ArrowUp') {
              event.preventDefault()
              move(-1)
            } else if (event.key === 'Home') {
              event.preventDefault()
              setActiveIndex(0)
            } else if (event.key === 'End') {
              event.preventDefault()
              setActiveIndex(Math.max(visible.length - 1, 0))
            } else if (event.key === 'Enter') {
              event.preventDefault()
              invokeActive()
            }
          }}
        />
        <span className="palette__esc" aria-hidden="true">
          Esc
        </span>
      </div>

      <p className="palette__status" role="status">
        {searching
          ? 'Searching the local index…'
          : notice ||
            (visible.length === 0
              ? 'No registered command matches that search.'
              : `${visible.length} registered ${visible.length === 1 ? 'command' : 'commands'}`)}
      </p>

      <ul className="palette__list" role="listbox" id={listId} aria-label="Commands">
        {visible.map((action, index) => (
          <li key={action.id}>
            <button
              type="button"
              id={`${listId}-option-${index}`}
              role="option"
              aria-selected={index === activeIndex}
              className="palette__option"
              tabIndex={-1}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => onInvoke(action.id)}
            >
              <span className="palette__option-icon">
                <PaletteIcon size={18} />
              </span>
              <span className="palette__option-text">
                <span className="palette__option-label">{action.label}</span>
                <span className="palette__option-description">
                  {action.description}
                </span>
              </span>
              {action.hint ? (
                <span className="palette__option-hint">{action.hint}</span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
    </dialog>
  )
}
