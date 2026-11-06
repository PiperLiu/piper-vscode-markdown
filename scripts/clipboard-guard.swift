// Test-only guard: keep every clipboard item/type in memory and restore on stdin close.
// No clipboard contents are printed or written to disk.
import AppKit
import Foundation
let board = NSPasteboard.general
var snapshot: [[(NSPasteboard.PasteboardType, Data)]] = []
for item in board.pasteboardItems ?? [] {
    var values: [(NSPasteboard.PasteboardType, Data)] = []
    for type in item.types {
        guard let data = item.data(forType: type) else {
            FileHandle.standardError.write(Data("Could not snapshot every clipboard type.\n".utf8))
            exit(1)
        }
        values.append((type, data))
    }
    snapshot.append(values)
}
FileHandle.standardOutput.write(Data("ready\n".utf8))
_ = readLine()
board.clearContents()
if !snapshot.isEmpty {
    let items = snapshot.map { values -> NSPasteboardItem in
        let item = NSPasteboardItem()
        for (type, data) in values { item.setData(data, forType: type) }
        return item
    }
    guard board.writeObjects(items) else {
        FileHandle.standardError.write(Data("Could not restore clipboard.\n".utf8))
        exit(1)
    }
}
FileHandle.standardOutput.write(Data("restored\n".utf8))
