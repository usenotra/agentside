import { Schema } from "effect";

export class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {
  path: Schema.String,
}) {}

export class RenderFailed extends Schema.TaggedError<RenderFailed>()("RenderFailed", {
  path: Schema.String,
  cause: Schema.Defect(),
}) {}

export class RemoteFailed extends Schema.TaggedError<RemoteFailed>()("RemoteFailed", {
  path: Schema.String,
  url: Schema.String,
  status: Schema.optional(Schema.Number),
  cause: Schema.optional(Schema.Defect()),
}) {}

export class SourceTimeout extends Schema.TaggedError<SourceTimeout>()("SourceTimeout", {
  path: Schema.String,
  timeoutMs: Schema.Number,
}) {}

export type ServeError = NotFound | RenderFailed | RemoteFailed | SourceTimeout;

export class InvalidConfig extends Schema.TaggedError<InvalidConfig>()("InvalidConfig", {
  message: Schema.String,
}) {}

export class FileFailed extends Schema.TaggedError<FileFailed>()("FileFailed", {
  path: Schema.String,
  operation: Schema.Literals(["read", "write", "list"]),
  cause: Schema.Defect(),
}) {}

export class PrerenderFailed extends Schema.TaggedError<PrerenderFailed>()("PrerenderFailed", {
  failures: Schema.Array(Schema.Struct({ path: Schema.String, reason: Schema.String })),
}) {}
