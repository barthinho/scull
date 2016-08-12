'use strict'

const debug = require('debug')('skiff.log')

class Log {

  constructor (node, lastLogIndex, lastLogTerm, persistedState) {
    this._node = node
    this._lastLogIndex = lastLogIndex || 0
    this._lastLogTerm = lastLogTerm || 0
    this._commitIndex = 0
    this._lastApplied = 0
    this._entries = []
  }

  setEntries (entries) {
    this._entries = entries
  }

  push (command) {
    const newLogIndex = ++this._lastLogIndex
    const newEntry = {
      t: this._lastLogTerm, // term
      i: newLogIndex, // index
      c: command // command
    }
    debug('%s: about to push new entry %j', this._node.id, newEntry)

    this._entries.push(newEntry)
    this._lastLogIndex = newLogIndex
  }

  head () {
    return this._entries[this._entries.length - 1]
  }

  atLogIndex (index) {
    let entry
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (!entry) {
        return
      }
      if (entry.i === index) {
        return entry
      }
    }
  }

  appendAfter (index, entries) {
    debug('%s: append after %d: %j', this._node.id, index, entries)
    // truncate
    let head
    while ((head = this.head()) && head.i > index) {
      this._entries.pop()
    }

    for (let i = 0; i < entries.length; i++) {
      this._entries.push(entries[i])
    }
  }

  commit (index, done) {
    if (typeof index !== 'number') {
      throw new Error('index needs to be a number')
    }
    if (typeof done !== 'function') {
      throw new Error('done needs to be a function')
    }
    debug('%s: commit %d', this._node.id, index)
    this._commitIndex = index

    const entriesToApply = this._entriesFromTo(this._lastApplied + 1, this._commitIndex)
    this._node.applyEntries(entriesToApply, (err) => {
      if (err) {
        done(err)
      } else {
        debug('%s: done commiting index %d', this._node.id, index)
        this._lastApplied = index
        done()
      }
    })
  }

  setTerm (t) {
    this._lastLogTerm = t
  }

  lastIndexForTerm (term) {
    let entry
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (!entry) {
        return
      }
      if (entry.t === term) {
        return entry.i
      }
    }
  }

  all () {
    return this._entries
  }

  entriesFrom (index) {
    const entries = this._entries.slice(this._physicalIndexFor(index))
    debug('entries from %d are %j', index, entries)
    return entries
  }

  _entriesFromTo (from, to) {
    const pFrom = this._physicalIndexFor(from)
    return this._entries.slice(pFrom, (to - from) + 1)
  }

  _physicalIndexFor (index) {
    let entry
    for (let i = this._entries.length - 1; i >= 0; i--) {
      entry = this._entries[i]
      if (entry.i === index) {
        return i
      } else if (entry.i < index) {
        return i + 1
      }
    }
    return 0
  }
}

module.exports = Log
