// Invoke only after wechat-host.js reports PASS, so this contains the synthetic article.
import AppKit
import Foundation
let pasteboard = NSPasteboard.general
let result: [String: Any] = [
    "types": pasteboard.types?.map { $0.rawValue } ?? [],
    "html": pasteboard.string(forType: .html) ?? "",
    "text": pasteboard.string(forType: .string) ?? "",
    "changeCount": pasteboard.changeCount
]
let data = try JSONSerialization.data(withJSONObject: result, options: [.prettyPrinted, .sortedKeys])
FileHandle.standardOutput.write(data)
