// @ts-nocheck
/* eslint-disable unicorn/prefer-node-protocol */
import core from '@actions/core'
import KeyCounter from 'key-counter'
import path from 'path'
import readFileJson from 'read-file-json'
import yaml from 'yaml'

const toYaml = input => yaml.stringify(input, null, {
  schema: `core`,
  lineWidth: 0,
  minContentWidth: 0,
  singleQuote: true,
  nullStr: `~`,
})

const ExclusionRule = class {
  value: string

  type: `static` | `regex` | `command`

  constructor(input) {
    if (typeof input === `string`) {
      this.value = input
      this.type = `static`
    }
    if (input instanceof RegExp) {
      this.value = input
      this.type = `regex`
    }
    if (Array.isArray(input)) {
      if (input[0] === `command`) {
        this.value = input[1]
        this.type = `command`
      }
    }
  }

  test(keystrokeObject) {
    if (this.type === `static`) {
      return keystrokeObject.key === this.value
    }
    if (this.type === `regex`) {
      return this.value.test(keystrokeObject.key)
    }
    if (this.type === `command`) {
      return keystrokeObject.command === this.value
    }
  }

  getTitle() {
    if (this.type === `static`) {
      return this.value
    }
    if (this.type === `regex`) {
      return this.value.source
    }
    if (this.type === `command`) {
      return `command ${this.value}`
    }
  }
}
const excludedKeystrokes = [
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)(up|left|right|down)$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)(pageup|pagedown)$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)(end|home)$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)backspace$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)delete$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)tab$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)enter$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)escape$/,
  /^(|(ctrl|alt|shift|ctrl\+alt|shift\+alt|ctrl\+shift|ctrl\+shift\+alt)\+)space$/,
  `ctrl+a`,
  `ctrl+c`,
  `ctrl+v`,
  `ctrl+z`,
  `ctrl+f`,
  `ctrl+shift+z`,
  `ctrl+shift+f`,
  `ctrl+w`,
  `ctrl+x`,
  [`command`, `editor.action.refactor`],
].map(input => new ExclusionRule(input))
const jsonPath = path.resolve(`src`, `global.jsonc`)
const data = await readFileJson.default(jsonPath)
export default () => {
  const result = []
  const excluded = []
  const exclusionCounter = new KeyCounter.default
  const keystrokeCounter = new KeyCounter.default
  for (const entry of data) {
    let isIncluded = true
    for (const excludedKeystroke of excludedKeystrokes) {
      if (excludedKeystroke.test(entry)) {
        isIncluded = false
        excluded.push(entry)
        exclusionCounter.feed(excludedKeystroke.getTitle())
        break
      }
    }
    if (!isIncluded) {
      continue
    }
    result.push({
      ...entry,
      command: `-${entry.command}`,
    })
  }
  core.info(`Loaded ${Object.keys(data).length} global keybindings from ${jsonPath}`)
  core.info(`Included ${result.length}, excluded ${data.length - result.length}`)
  core.startGroup(`YAML output (keystrokes to delete)`)
  core.info(toYaml(result))
  core.endGroup()
  core.startGroup(`Excluded (keystrokes to keep)`)
  core.info(`Excluded ${excluded.length} keybindings`)
  core.info(toYaml(exclusionCounter.toObjectSortedByValues()))
  core.info(toYaml(excluded))
  core.endGroup()
  const keystrokeList = Object.entries(keystrokeCounter.toObjectSortedByValues()).map(([key, value]) => {
    return {
      key,
      value,
      keystrokes: data.filter(entry => entry.key === key),
    }
  })
  keystrokeList.reverse()
  for (const entry of keystrokeList) {
    core.startGroup(`Keystroke ${entry.key} (${entry.value})`)
    core.info(entry)
    core.endGroup()
  }
  return {
    result,
    excluded,
  }
}