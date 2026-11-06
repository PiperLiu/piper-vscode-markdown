import AppKit
import Foundation
struct Payload: Decodable { let html: String; let text: String }
do {
 let payload = try JSONDecoder().decode(Payload.self, from: FileHandle.standardInput.readDataToEndOfFile())
 let item = NSPasteboardItem()
 guard item.setString(payload.html, forType: .html), item.setString(payload.text, forType: .string) else { exit(2) }
 let verify = CommandLine.arguments.contains("--verify")
 let pasteboard = verify ? NSPasteboard(name: NSPasteboard.Name("piper-wechat-test-" + UUID().uuidString)) : NSPasteboard.general
 pasteboard.clearContents()
 guard pasteboard.writeObjects([item]) else { exit(3) }
 if verify {
  guard pasteboard.string(forType: .html) == payload.html, pasteboard.string(forType: .string) == payload.text else { exit(4) }
  pasteboard.releaseGlobally()
  print("HTML and text pasteboard round-trip passed")
 }
} catch { fputs("Invalid clipboard payload\n", stderr); exit(1) }
