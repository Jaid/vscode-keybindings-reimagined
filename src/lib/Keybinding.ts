import {title} from 'node:process'

import preventStart from 'prevent-start'
import {firstMatch, Match} from 'super-regex'
import {Writable} from 'type-fest'

import keySorting from 'lib/keySorting.js'

export type RawKeybinding = {
  key: string
  command: string
  args?: string[]
  when?: string
}

export type HalvesSplit = {
  prefix?: string
  baseKey: string
}

export type KeyVisualization = {
  type: "baseKey" | `connector` | `modifierKey`
  value: string
  title: string
}

const collator = new Intl.Collator(`de`)

// Useful: https://kbdlayout.info/KBDGR/virtualkeys
const titleMap: Record<string, string> = {
  escape: `ESC`,
  up: `▲`,
  down: `▼`,
  left: `◀`,
  right: `▶`,
  oem_1: `Ü`,
  oem_2: `#`,
  oem_3: `#`,
  oem_4: `ẞ`,
  oem_5: `^`,
  oem_6: `´`,
  oem_7: `Ä`,
  oem_period: `.`,
  oem_comma: `,`,
  oem_minus: `-`,
  oem_plus: `+`,
  oem_102: `<`,
}

const getTitleFromKey = (key: Keybinding['key']) => {
  if (titleMap[key]) {
    return titleMap[key]
  }
  if (key.startsWith(`numpad_`)) {
    return `Numpad ${key.slice(7).toUpperCase()}`
  }
  if (key.startsWith(`numpad`)) {
    return `Numpad ${key.slice(6)}`
  }
  return key.toUpperCase()
}

export default class Keybinding {
  #setupKeystrokes?: string[]
  #key: string
  #command: string
  #args?: string[]
  #when?: string
  #modifierAlt: boolean = false
  #modifierCtrl: boolean = false
  #modifierShift: boolean = false
  static fromRaw(raw: RawKeybinding) {
    return new Keybinding(raw)
  }
  constructor(data: RawKeybinding) {
    this.#command = data.command
    if (data.args) {
      this.#args = data.args
    }
    if (data.when) {
      this.#when = data.when
    }
    const keystrokes = data.key.split(/\s+/)
    const keystroke = keystrokes.at(-1) as string
    if (keystrokes.length > 1) {
      this.#setupKeystrokes = keystrokes.slice(0, -1)
    }
    const keystrokeParts = keystroke.split(`\\s*+\\*s`)
    for (const keystrokePart of keystrokeParts) {
      if (keystrokePart === `ctrl`) {
        this.#modifierCtrl = true
        continue
      }
      if (keystrokePart === `shift`) {
        this.#modifierShift = true
        continue
      }
      if (keystrokePart === `alt`) {
        this.#modifierAlt = true
        continue
      }
      if (this.#key) {
        throw new Error(`Keybinding “${data.key}” has multiple base keys: “${this.#key}” and “${keystrokePart}”`)
      }
      this.#key = keystrokePart
    }
  }
  isCombo() {
    return this.#setupKeystrokes !== undefined
  }
  isAddition() {
    // return !this.#key.startsWith(`-`)
    return !this.#key.startsWith(`-`)
  }
  asVisualization(): KeyVisualization[] {
    return this.toParts().map(part => {
      if (part === ` `) {
        return {
          type: `connector`,
          value: part,
          title: ` → `,
        }
      }
      if (part === `+`) {
        return {
          type: `connector`,
          value: part,
          title: ` `,
        }
      }
      if ([`ctrl`, `shift`, `alt`].includes(part)) {
        return {
          type: `modifierKey`,
          value: part,
          title: getTitleFromKey(part),
        }
      }
      return {
        type: `baseKey`,
        value: part,
        title: getTitleFromKey(part),
      }
    })
  }
  toParts() {
    return this.#key.split(/([ +])/)
  }
  toKeys() {
    return this.#key.split(/[ +]/) as [...string[], string]
  }
  toRaw() {
    const raw: RawKeybinding = {
      key: this.#key,
      command: this.#command,
    }
    if (this.#args) {
      raw.args = this.#args
    }
    if (this.#when) {
      raw.when = this.#when
    }
    return raw
  }
  isComplex() {
    return /[ +]/.test(this.#key)
  }
  splitIntoHalves(): HalvesSplit {
    const result = firstMatch(/(?<prefix>.+[ +])?(?<baseKey>.+)$/, this.#key)
    if (!result) {
      throw new Error(`Could not split keybinding into halves: ${this.#key}`)
    }
    return result.namedGroups as HalvesSplit
  }
  getBaseKey() {
    return this.splitIntoHalves().baseKey
  }
  getPrefix() {
    return this.splitIntoHalves().prefix
  }
  getLogic() {
    if (this.#command.startsWith(`-`)) {
      return `deletion`
    }
    return `addition`
  }
  getComplexity() {
    const keys = this.toKeys()
    if (keys.length === 1) {
      return 0
    }
    const modifiers = keys.slice(0, -1)
    return modifiers.length * 10 + modifiers.join(``).length
  }
  asPositive() {
    const raw = this.toRaw()
    return new Keybinding({
      ...raw,
      command: preventStart.default(raw.command, `-`),
    })
  }
  compareTo(other: Keybinding): number {
    const thisIsDeletion = this.getLogic() === `deletion`
    const otherIsDeletion = other.getLogic() === `deletion`
    if (thisIsDeletion && !otherIsDeletion) {
      return -1
    }
    if (!thisIsDeletion && otherIsDeletion) {
      return 1
    }
    if (thisIsDeletion && otherIsDeletion) {
      return this.asPositive().compareTo(other.asPositive())
    }
    const thisBaseKey = this.getBaseKey()
    const otherBaseKey = other.getBaseKey()
    if (thisBaseKey !== otherBaseKey) {
      const thisIsSortedKey = keySorting.includes(thisBaseKey)
      const otherIsSortedKey = keySorting.includes(otherBaseKey)
      if (thisIsSortedKey && !otherIsSortedKey) {
        return -1
      }
      if (!thisIsSortedKey && otherIsSortedKey) {
        return 1
      }
      if (thisIsSortedKey && otherIsSortedKey) {
        return keySorting.indexOf(thisBaseKey) - keySorting.indexOf(otherBaseKey)
      }
      return collator.compare(thisBaseKey, otherBaseKey)
    }
    const thisComplexity = this.getComplexity()
    const otherComplexity = other.getComplexity()
    if (thisComplexity !== otherComplexity) {
      return thisComplexity - otherComplexity
    }
    if (this.#command !== other.#command) {
      return collator.compare(this.#command, other.#command)
    }
    return collator.compare(this.#when ?? ``, other.#when ?? ``)
  }
}

export const sortRaw = (a: RawKeybinding, b: RawKeybinding) => {
  return Keybinding.fromRaw(a).compareTo(Keybinding.fromRaw(b))
}
