# Image hosting / 图床配置

[English](#english) · [简体中文](#中文)

## English

This guide covers Piper Markdown 0.4.1 image-host connections. Setup and credential actions are available from the preview’s publishing menu.

### Connections and credentials

Start with image-host setup in the preview’s publishing menu. The setup flow writes the selected connection to **VS Code User Settings**; advanced parameters remain available there. The provider setting is `piperMarkdown.imageHostProvider`. Upload destinations, authentication locations, and connection parameters cannot be overridden by a workspace.

Use the publishing menu to set or clear the current connection’s upload credential. When copy needs a missing endpoint or credential, use the action in the error message to configure it. The corresponding commands remain available for keyboard-driven workflows. Secrets are stored in SecretStorage. Set the token again after changing provider, endpoint, authentication location, or Qiniu public base URL. Existing Piper connections retain their original token scope.

Cancelling setup, including its credential prompt, leaves the prior connection and credentials unchanged. Anonymous Generic hosting does not require a token. The connection summary provides credential status and a focused Advanced Settings link.

Extra `uploadHeaders` and `uploadFields` are for non-secret static metadata such as an album identifier. Do not store passwords, tokens, or AK/SK there. Piper does not issue or refresh Qiniu upload tokens and does not require account signing keys.

### Provider settings

All keys below use the `piperMarkdown.` prefix. The examples in this section can be entered in User Settings; the image-host setup flow covers the common fields.

| Setting | Applies to | Meaning |
| --- | --- | --- |
| `imageHostProvider` | All | `piper` (default), `generic`, or `qiniu` |
| `uploadUrl` | All | Complete HTTPS upload endpoint |
| `fileField` | Piper / Generic | Multipart file field; default `file` |
| `urlField` | Piper / Generic | Dot-separated JSON field containing a complete image URL; default `url` |
| `ttl` | Piper | Requested image retention, such as `3h` or `24h` |
| `uploadAuthMode` | Generic | `header`, `form`, or `none` |
| `uploadHeaderName` | Generic header | Credential header name |
| `uploadHeaderPrefix` | Generic header | Prefix before the stored token, such as `Bearer ` or an empty string |
| `uploadTokenField` | Generic form | Multipart credential field |
| `uploadHeaders` / `uploadFields` | Generic / Qiniu | Additional non-secret static headers/form fields |
| `publicBaseUrl` | Qiniu | Public HTTPS read domain, optionally with an already mapped path prefix |
| `qiniuKeyPrefix` | Qiniu | Object-name directory prefix, such as `wechat/` |

### Piper-compatible endpoint

```json
{
  "piperMarkdown.imageHostProvider": "piper",
  "piperMarkdown.uploadUrl": "https://images.example.com/api/public-images",
  "piperMarkdown.ttl": "3h",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

**Piper** sends a multipart POST with `?ttl=...`, a Bearer token, and `X-Requested-With: ThemeTodo`. The response supplies a public URL, normally in `url`. The image host enforces expiration and capacity. A typical response is:

```json
{
  "url": "https://images.example.com/public-images/opaque-id",
  "expires_at": "2030-01-02T03:00:00Z"
}
```

### Generic HTTP

```json
{
  "piperMarkdown.imageHostProvider": "generic",
  "piperMarkdown.uploadUrl": "https://uploads.example.com/images",
  "piperMarkdown.uploadAuthMode": "header",
  "piperMarkdown.uploadHeaderName": "X-API-Key",
  "piperMarkdown.uploadHeaderPrefix": "",
  "piperMarkdown.fileField": "image",
  "piperMarkdown.urlField": "data.links.public",
  "piperMarkdown.uploadHeaders": { "Accept": "application/json" },
  "piperMarkdown.uploadFields": { "album": "articles" }
}
```

**Generic** sends the configured multipart file and static fields. Header mode combines `uploadHeaderPrefix` with the SecretStorage token in `uploadHeaderName`; form mode puts the token in `uploadTokenField`. Use `none` only for an endpoint that needs no credentials. `urlField: "data.links.public"` reads a response such as `{"data":{"links":{"public":"https://images.example.com/article.png"}}}`. Piper-specific TTL, headers, and cloud signatures are not added. Services requiring an SDK, a separate signing exchange, or multiple secrets need a compatible upload gateway.

For a token in the multipart form, use:

```json
{
  "piperMarkdown.imageHostProvider": "generic",
  "piperMarkdown.uploadUrl": "https://uploads.example.com/images",
  "piperMarkdown.uploadAuthMode": "form",
  "piperMarkdown.uploadTokenField": "token",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

The credential is still entered through the extension and held in SecretStorage, not in this JSON. Use `uploadAuthMode: "none"` only for an endpoint that deliberately accepts anonymous uploads.

### Qiniu Kodo setup

Use this Qiniu configuration, replacing the public read domain and selecting your bucket's upload region:

```json
{
  "piperMarkdown.imageHostProvider": "qiniu",
  "piperMarkdown.uploadUrl": "https://up-z0.qiniup.com",
  "piperMarkdown.publicBaseUrl": "https://images.example.com",
  "piperMarkdown.qiniuKeyPrefix": "wechat/"
}
```
 `https://up-z0.qiniup.com` is the official `z0` endpoint; other regions are listed in Qiniu's [region table](https://developer.qiniu.com/kodo/1671/region-endpoint-fq).

The built-in adapter uses fixed multipart `token`, `key`, and `file` fields, then reads `key` from the direct JSON response. It does not use Generic `fileField` or `urlField`. See Qiniu's [upload API](https://developer.qiniu.com/kodo/1312/upload).

Obtain a temporary upload token from your service/tool and enter it through the publishing menu’s credential action. Allow the target bucket or a matching key prefix; prefix authorization uses `isPrefixalScope: 1`. A token restricted to one fixed object name is unsuitable because Piper generates a new name for each image. Keep a direct JSON response containing `key`, without a post-upload redirect. See the [upload policy](https://developer.qiniu.com/kodo/manual/put-policy).

The resulting object key is appended to `publicBaseUrl`. For example, `wechat/<random-name>.png` becomes `https://images.example.com/wechat/<random-name>.png`. The base is your public read domain, not the upload endpoint, and no bucket name is added automatically.

Token expiry limits new uploads; bucket lifecycle rules determine how long uploaded images remain. Piper's `ttl` does not alter Qiniu retention. Replace expired tokens through the credential action. Keep AK/SK on the service that generates tokens; only the upload token belongs in the extension. See Qiniu's [upload-token documentation](https://developer.qiniu.com/kodo/1208/upload-token).

### Public access and troubleshooting

Images should be publicly readable through HTTPS, without authentication, with GET/HEAD and appropriate browser-editor CORS responses such as `Access-Control-Allow-Origin: *`. Read and upload origins may differ. Loopback HTTP is allowed only for local Piper/Generic development; Qiniu public URLs require HTTPS. Upload redirects are rejected.

- `429`: the host is busy or rate-limiting requests. Piper queues its own uploads and retries explicit 429 responses with a visible countdown when the wait fits its retry budget. A longer Retry-After is shown as a wait instruction. You do not need to reset credentials for 429.
- `401/403`: recheck credentials for the selected connection; for Qiniu, also check region, deadline, bucket, and permitted key prefix.
- Successful upload without a usable URL: correct the nested `urlField`; Qiniu needs a response `key`.
- Image `403/404`: check domain/path mapping, public access, HTTPS, CORS, and hotlink-protection rules.
- Expired images: check host or bucket retention separately from upload-token expiry.

Previewing does not upload local images. Successful copy confirms resource processing and clipboard creation; saving and reopening the WeChat draft is a separate image-retention check.

## 中文

本页说明 Piper Markdown 0.4.1 的图床连接。预览中的发布菜单提供配置与凭据操作。

### 连接与凭据

先从预览中的发布菜单进入图床配置向导。向导将常用连接参数保存到 **VS Code 用户设置**，高级参数仍可在设置中修改；提供商对应 `piperMarkdown.imageHostProvider`。上传地址、认证位置和图床附加参数不接受工作区覆盖，避免打开一篇文档就改变上传目的地。

需要认证时，从发布菜单设置当前连接的上传凭据，凭据保存在 SecretStorage。复制时若缺少上传地址或凭据，可直接使用错误提示中的操作完成配置。命令面板仍保留对应命令，供键盘工作流使用。切换服务类型、上传地址、认证位置或七牛公共资源地址后，重新为该连接设置 Token。旧 Piper 连接仍使用原有 Token。通过发布菜单的清除凭据操作移除当前连接的凭据。

取消配置（包括最后的凭据输入）会保留原连接与凭据。匿名 Generic 图床不需要 Token。连接摘要提供凭据状态和仅显示图床参数的高级设置入口。

`uploadHeaders` 和 `uploadFields` 仅用于非秘密静态值，例如相册标识。Token、密码、AK/SK 等不能写入这些对象、设置文件或 Markdown。扩展不会替你签发、刷新七牛凭证，也不需要七牛账号密钥。

### 三种上传方式

| 设置 | 使用位置 | 说明 |
| --- | --- | --- |
| `imageHostProvider` | 全部 | `piper`（默认）、`generic`、`qiniu` |
| `uploadUrl` | 全部 | 完整上传地址，使用 HTTPS |
| `fileField` | Piper / Generic | multipart 文件字段，默认 `file` |
| `urlField` | Piper / Generic | 返回 JSON 中公共图片 URL 的点分路径，默认 `url`；例如 `data.url` |
| `ttl` | Piper | 临时图片生命周期，例如 `3h`、`24h` |
| `uploadAuthMode` | Generic | `header`、`form`、`none` |
| `uploadHeaderName` | Generic header | Token 所在请求头，例如 `Authorization` 或 `X-API-Key` |
| `uploadHeaderPrefix` | Generic header | Token 前缀，例如 `Bearer `；API Key 可用空字符串 |
| `uploadTokenField` | Generic form | Token 所在 multipart 字段，例如 `token` |
| `uploadHeaders` | Generic / Qiniu | 非秘密附加请求头 |
| `uploadFields` | Generic / Qiniu | 非秘密附加 multipart 字段 |
| `publicBaseUrl` | Qiniu | 图片公共 HTTPS 域名，可包含服务已映射的路径前缀 |
| `qiniuKeyPrefix` | Qiniu | 对象目录前缀，例如 `wechat/` |

所有设置名均带 `piperMarkdown.` 前缀。七牛固定使用 `file`、`token`、`key` 字段，以及响应中的 `key`；无需为其设置 `fileField` 或 `urlField`。

### Piper 兼容接口

```json
{
  "piperMarkdown.imageHostProvider": "piper",
  "piperMarkdown.uploadUrl": "https://images.example.com/api/public-images",
  "piperMarkdown.ttl": "3h",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

发送 multipart POST，附加 `?ttl=3h`、`Authorization: Bearer <SecretStorage 中的 Token>` 和 `X-Requested-With: ThemeTodo`。预期 JSON：

```json
{
  "url": "https://images.example.com/public-images/opaque-id",
  "expires_at": "2030-01-02T03:00:00Z"
}
```

过期清理与容量限制由图床执行。`ttl` 不会自动发送到 Generic 或七牛服务。

### Generic：请求头认证

```json
{
  "piperMarkdown.imageHostProvider": "generic",
  "piperMarkdown.uploadUrl": "https://uploads.example.com/images",
  "piperMarkdown.uploadAuthMode": "header",
  "piperMarkdown.uploadHeaderName": "X-API-Key",
  "piperMarkdown.uploadHeaderPrefix": "",
  "piperMarkdown.fileField": "image",
  "piperMarkdown.urlField": "data.links.public",
  "piperMarkdown.uploadHeaders": { "Accept": "application/json" },
  "piperMarkdown.uploadFields": { "album": "articles" }
}
```

先通过设置凭据操作保存 API Key，再复制文章。上例读取：

```json
{ "data": { "links": { "public": "https://images.example.com/article.png" } } }
```

需要 `Authorization: Bearer ...` 的服务，把请求头名改为 `Authorization`，前缀改为 `Bearer `（末尾有空格）。

### Generic：表单认证或无认证

表单 Token 示例：

```json
{
  "piperMarkdown.imageHostProvider": "generic",
  "piperMarkdown.uploadUrl": "https://uploads.example.com/images",
  "piperMarkdown.uploadAuthMode": "form",
  "piperMarkdown.uploadTokenField": "token",
  "piperMarkdown.fileField": "file",
  "piperMarkdown.urlField": "url"
}
```

Token 来自 SecretStorage，作为单独 multipart 字段发送。服务无需认证时使用 `uploadAuthMode: "none"`，不必保存 Token。Generic 不自动加 Piper 专用请求头、TTL 参数或云平台签名；接口须接受 multipart，并直接返回完整公共图片 URL。需要 SDK、额外签名流程或多个秘密参数的服务，可通过自己的兼容上传网关接入。

### 七牛 Kodo

```json
{
  "piperMarkdown.imageHostProvider": "qiniu",
  "piperMarkdown.uploadUrl": "https://up-z0.qiniup.com",
  "piperMarkdown.publicBaseUrl": "https://images.example.com",
  "piperMarkdown.qiniuKeyPrefix": "wechat/"
}
```

1. 准备可匿名读取图片的空间与 HTTPS 资源域名，并为图片读取配置跨域策略。
2. 按空间所在区域填写上传地址。上例仅适用于华东-浙江 `z0`；其他区域参见七牛[存储区域表](https://developer.qiniu.com/kodo/1671/region-endpoint-fq)。
3. 使用自己的服务或工具签发临时上传凭证，通过扩展的设置凭据操作保存。扩展使用官方 multipart `token`、`key`、`file` 直传接口；参见[直传文件](https://developer.qiniu.com/kodo/1312/upload)。
4. 凭证允许整个目标 Bucket，或允许与 `qiniuKeyPrefix` 相匹配的前缀。前缀授权需在上传策略中设置 `isPrefixalScope: 1`。不要使用只允许单个固定对象名的凭证，因为每张图都会生成新名称。参见[上传策略](https://developer.qiniu.com/kodo/manual/put-policy)。
5. 保持直接 JSON 响应包含 `key`，不要配置上传后浏览器重定向。扩展将响应 key 拼接到 `publicBaseUrl`，形成文章中的图片地址。

例如对象名 `wechat/<随机名称>.png` 对应 `https://images.example.com/wechat/<随机名称>.png`。`publicBaseUrl` 是读取域名，不是上传域名，也不会自动增加 Bucket 名称。

上传 Token 的有效期仅决定何时还能上传，不决定已上传文件何时删除。图片保留时间由七牛空间生命周期规则控制，Piper 的 `ttl` 不会改变它。临时凭证过期后，通过设置凭据操作替换即可；生成凭证的服务持有 AK/SK，扩展只接收上传凭证。官方说明见[上传凭证](https://developer.qiniu.com/kodo/1208/upload-token)。

### 图片读取与排错

- 图片应通过公共 HTTPS URL 匿名访问，支持 GET/HEAD，并为浏览器编辑器设置适当跨域响应，例如 `Access-Control-Allow-Origin: *`。上传地址和读取地址可以不同。
- 只为本地开发保留 Piper/Generic 回环 HTTP 支持；七牛 `publicBaseUrl` 始终要求 HTTPS。上传重定向会被拒绝。
- `401/403`：检查当前连接是否重新设置了凭据；七牛还需核对区域、凭证有效期、Bucket 与对象名前缀。
- `429`：图床繁忙或上传过于频繁。Piper 会将自己的上传排队，在允许的重试预算内遵循 `Retry-After`，并显示重试倒计时；服务端要求等待更久时，会提示等待后再试。429 不需要重新设置凭据。
- 上传成功却没有 URL：检查 `urlField` 是否匹配真实 JSON；七牛响应必须含 `key`。
- 图片 URL 返回 `403/404`：检查域名与路径映射、对象是否公开、HTTPS、跨域和防盗链设置。
- 图片自动过期：检查图床或空间生命周期；不要把 Token 过期和图片过期混为一谈。

本地预览不会上传图片。复制成功仅说明资源处理与剪贴板写入成功；请在微信保存并重新打开草稿，另行确认图片已被平台保留。
