import { Express, Request, Response } from "express";
import swaggerUi from "swagger-ui-express";
import { apiRouteDefinitions, ApiRouteDefinition } from "../routes/api";
import { VERSION } from "../version";

type OpenApiMethod = "delete" | "get" | "patch" | "post" | "put";
type ParameterLocation = "path" | "query" | "header";

type SchemaObject = Record<string, unknown>;

type DocumentedRoute = {
  allowApiKey?: boolean;
  method: OpenApiMethod;
  path: string;
  public?: boolean;
};

type OpenApiParameter = {
  description?: string;
  in: ParameterLocation;
  name: string;
  required?: boolean;
  schema: SchemaObject;
};

type OpenApiOperation = {
  description?: string;
  operationId: string;
  parameters?: OpenApiParameter[];
  requestBody?: {
    content: Record<string, unknown>;
    description?: string;
    required?: boolean;
  };
  responses: Record<string, { content?: Record<string, unknown>; description: string }>;
  security?: Array<Record<string, string[]>>;
  summary: string;
  tags: string[];
  "x-codeSamples"?: Array<{ lang: "curl"; label: string; source: string }>;
};

type OpenApiDocument = {
  components: {
    schemas: Record<string, SchemaObject>;
    securitySchemes: Record<string, unknown>;
  };
  info: {
    description: string;
    title: string;
    version: string;
  };
  openapi: "3.0.3";
  paths: Record<string, Partial<Record<OpenApiMethod, OpenApiOperation>>>;
  servers: Array<{ url: string }>;
  tags: Array<{ description?: string; name: string }>;
};

type RouteSpec = {
  description?: string;
  operationId?: string;
  query?: OpenApiParameter[];
  request?: string | SchemaObject;
  requestContentType?: "application/json" | "multipart/form-data";
  response?: string | SchemaObject;
  responseContentType?: "application/json" | "application/octet-stream" | "application/xml" | "text/plain";
  responses?: Record<string, string | SchemaObject>;
  summary?: string;
  tags?: string[];
};

const json = (schema: string | SchemaObject) => ({
  schema: typeof schema === "string" ? { $ref: `#/components/schemas/${schema}` } : schema,
});

const schemaRef = (name: string): SchemaObject => ({ $ref: `#/components/schemas/${name}` });

const arrayOf = (schema: string | SchemaObject): SchemaObject => ({
  type: "array",
  items: typeof schema === "string" ? schemaRef(schema) : schema,
});

const nullable = (schema: SchemaObject): SchemaObject => ({ ...schema, nullable: true });

const objectSchema = (
  properties: Record<string, SchemaObject>,
  required: string[] = [],
  extra: Partial<SchemaObject> = {}
): SchemaObject => ({
  type: "object",
  additionalProperties: false,
  properties,
  ...(required.length > 0 ? { required } : {}),
  ...extra,
});

const successSchema = (data?: SchemaObject): SchemaObject =>
  objectSchema({
    success: { type: "boolean", example: true },
    message: { type: "string" },
    ...(data ? { data } : {}),
  });

const errorSchema = objectSchema(
  {
    error: { type: "string" },
    errorKey: { type: "string" },
    details: { type: "string" },
    waitTime: { type: "number" },
  },
  ["error"],
  { additionalProperties: true }
);

const fileUploadSchema = (fieldName = "file"): SchemaObject =>
  objectSchema(
    {
      [fieldName]: { type: "string", format: "binary" },
    },
    [fieldName]
  );

const commonSchemas: Record<string, SchemaObject> = {
  ApiError: errorSchema,
  SuccessResponse: successSchema(),
  MessageResponse: successSchema(),
  VideoSubtitle: objectSchema(
    {
      language: { type: "string", example: "en" },
      filename: { type: "string" },
      path: { type: "string" },
    },
    ["language", "filename", "path"]
  ),
  Video: objectSchema(
    {
      id: { type: "string" },
      title: { type: "string" },
      author: { type: "string", nullable: true },
      date: { type: "string", nullable: true },
      source: {
        type: "string",
        enum: ["youtube", "bilibili", "twitch", "local", "missav", "cloud", "unknown"],
      },
      sourceUrl: { type: "string", nullable: true },
      videoFilename: { type: "string", nullable: true },
      thumbnailFilename: { type: "string", nullable: true },
      videoPath: { type: "string", nullable: true },
      thumbnailPath: { type: "string", nullable: true },
      thumbnailUrl: { type: "string", nullable: true },
      addedAt: { type: "string", nullable: true },
      createdAt: { type: "string" },
      updatedAt: { type: "string", nullable: true },
      partNumber: { type: "integer", nullable: true },
      totalParts: { type: "integer", nullable: true },
      seriesTitle: { type: "string", nullable: true },
      rating: { type: "integer", minimum: 1, maximum: 5, nullable: true },
      description: { type: "string", nullable: true },
      viewCount: { type: "integer", nullable: true },
      duration: { type: "string", nullable: true },
      tags: { type: "array", items: { type: "string" } },
      progress: { type: "number", nullable: true },
      fileSize: { type: "string", nullable: true },
      lastPlayedAt: { type: "integer", nullable: true },
      subtitles: arrayOf("VideoSubtitle"),
      channelUrl: { type: "string", nullable: true },
      visibility: { type: "integer", enum: [0, 1], nullable: true },
      signedUrl: { type: "string", nullable: true },
      signedThumbnailUrl: { type: "string", nullable: true },
      authorAvatarFilename: { type: "string", nullable: true },
      authorAvatarPath: { type: "string", nullable: true },
    },
    ["id", "title", "createdAt"],
    { additionalProperties: true }
  ),
  Comment: objectSchema(
    {
      id: { type: "string" },
      author: { type: "string" },
      content: { type: "string" },
      date: { type: "string" },
      avatar: { type: "string", nullable: true },
    },
    ["id", "author", "content", "date"]
  ),
  Collection: objectSchema(
    {
      id: { type: "string" },
      name: { type: "string" },
      title: { type: "string", nullable: true },
      videos: { type: "array", items: { type: "string" } },
      createdAt: { type: "string" },
      updatedAt: { type: "string", nullable: true },
    },
    ["id", "name", "videos", "createdAt"],
    { additionalProperties: true }
  ),
  DownloadInfo: objectSchema(
    {
      id: { type: "string" },
      title: { type: "string" },
      timestamp: { type: "integer", nullable: true },
      filename: { type: "string", nullable: true },
      totalSize: { type: "string", nullable: true },
      downloadedSize: { type: "string", nullable: true },
      progress: { type: "number", nullable: true },
      speed: { type: "string", nullable: true },
      sourceUrl: { type: "string", nullable: true },
      type: { type: "string", nullable: true },
      retryMetadata: { type: "string", nullable: true },
    },
    ["id", "title"]
  ),
  DownloadStatus: objectSchema(
    {
      activeDownloads: arrayOf("DownloadInfo"),
      queuedDownloads: arrayOf("DownloadInfo"),
    },
    ["activeDownloads", "queuedDownloads"]
  ),
  DownloadHistoryItem: objectSchema(
    {
      id: { type: "string" },
      title: { type: "string" },
      author: { type: "string", nullable: true },
      sourceUrl: { type: "string", nullable: true },
      finishedAt: { type: "integer" },
      status: {
        type: "string",
        enum: ["success", "failed", "skipped", "deleted", "pending_retry"],
      },
      error: { type: "string", nullable: true },
      videoPath: { type: "string", nullable: true },
      thumbnailPath: { type: "string", nullable: true },
      totalSize: { type: "string", nullable: true },
      videoId: { type: "string", nullable: true },
      downloadedAt: { type: "integer", nullable: true },
      deletedAt: { type: "integer", nullable: true },
      subscriptionId: { type: "string", nullable: true },
      taskId: { type: "string", nullable: true },
      platform: { type: "string", nullable: true },
      sourceKind: { type: "string", nullable: true },
      downloadType: { type: "string", nullable: true },
      retryCount: { type: "integer", nullable: true },
      retryLimit: { type: "integer", nullable: true },
      retryIntervalMinutes: { type: "integer", nullable: true },
      nextRetryAt: { type: "integer", nullable: true },
      retryMetadata: { type: "string", nullable: true },
    },
    ["id", "title", "finishedAt", "status"]
  ),
  Subscription: objectSchema(
    {
      id: { type: "string" },
      author: { type: "string" },
      authorUrl: { type: "string" },
      interval: { type: "integer" },
      lastVideoLink: { type: "string", nullable: true },
      lastCheck: { type: "integer", nullable: true },
      downloadCount: { type: "integer" },
      createdAt: { type: "integer" },
      platform: { type: "string" },
      paused: { type: "boolean" },
      playlistId: { type: "string", nullable: true },
      playlistTitle: { type: "string", nullable: true },
      subscriptionType: { type: "string", enum: ["author", "playlist"] },
      collectionId: { type: "string", nullable: true },
      downloadShorts: { type: "boolean" },
      retentionDays: { type: "integer", nullable: true },
      consecutiveFailureCount: { type: "integer" },
      lastCheckStatus: { type: "string", nullable: true },
      lastFailureReason: { type: "string", nullable: true },
    },
    ["id", "author", "authorUrl", "interval", "createdAt"]
  ),
  ContinuousDownloadTask: objectSchema(
    {
      id: { type: "string" },
      subscriptionId: { type: "string", nullable: true },
      collectionId: { type: "string", nullable: true },
      authorUrl: { type: "string" },
      author: { type: "string" },
      platform: { type: "string" },
      status: { type: "string", enum: ["active", "paused", "completed", "cancelled", "failed"] },
      totalVideos: { type: "integer" },
      downloadedCount: { type: "integer" },
      skippedCount: { type: "integer" },
      failedCount: { type: "integer" },
      currentVideoIndex: { type: "integer" },
      createdAt: { type: "integer" },
      updatedAt: { type: "integer", nullable: true },
      completedAt: { type: "integer", nullable: true },
      error: { type: "string", nullable: true },
      downloadOrder: { type: "string" },
    },
    ["id", "authorUrl", "author", "platform", "status", "createdAt"]
  ),
  Settings: objectSchema(
    {
      loginEnabled: { type: "boolean" },
      apiKeyEnabled: { type: "boolean" },
      apiKey: { type: "string" },
      isPasswordSet: { type: "boolean" },
      passwordLoginAllowed: { type: "boolean" },
      isVisitorPasswordSet: { type: "boolean" },
      defaultAutoPlay: { type: "boolean" },
      defaultAutoLoop: { type: "boolean" },
      maxConcurrentDownloads: { type: "integer" },
      autoRetryEnabled: { type: "boolean" },
      autoRetryTimes: { type: "integer" },
      autoRetryIntervalMinutes: { type: "integer" },
      dontSkipDeletedVideo: { type: "boolean" },
      language: { type: "string" },
      tags: { type: "array", items: { type: "string" } },
      cloudDriveEnabled: { type: "boolean" },
      openListApiUrl: { type: "string" },
      openListToken: { type: "string" },
      openListPublicUrl: { type: "string" },
      cloudDrivePath: { type: "string" },
      cloudDriveScanPaths: { type: "string" },
      homeSidebarOpen: { type: "boolean" },
      subtitlesEnabled: { type: "boolean" },
      websiteName: { type: "string" },
      itemsPerPage: { type: "integer" },
      ytDlpConfig: { type: "string" },
      showYoutubeSearch: { type: "boolean" },
      proxyOnlyYoutube: { type: "boolean" },
      moveSubtitlesToVideoFolder: { type: "boolean" },
      moveThumbnailsToVideoFolder: { type: "boolean" },
      saveAuthorFilesToCollection: { type: "boolean" },
      visitorUserEnabled: { type: "boolean" },
      infiniteScroll: { type: "boolean" },
      videoColumns: { type: "integer" },
      cloudflaredTunnelEnabled: { type: "boolean" },
      cloudflaredToken: { type: "string" },
      allowedHosts: { type: "string" },
      pauseOnFocusLoss: { type: "boolean" },
      playSoundOnTaskComplete: { type: "string" },
      tmdbApiKey: { type: "string" },
      mountDirectories: { type: "string" },
      defaultSort: { type: "string" },
      preferredAudioLanguage: { type: "string" },
      defaultVideoCodec: { type: "string" },
      authorTags: { type: "object", additionalProperties: arrayOf({ type: "string" }) },
      collectionTags: { type: "object", additionalProperties: arrayOf({ type: "string" }) },
      showTagsOnThumbnail: { type: "boolean" },
      playFromBeginning: { type: "boolean" },
      theme: { type: "string", enum: ["light", "dark", "system"] },
      showThemeButton: { type: "boolean" },
      telegramEnabled: { type: "boolean" },
      telegramBotToken: { type: "string" },
      telegramChatId: { type: "string" },
      telegramDownloadEnabled: { type: "boolean" },
      telegramNotifyOnSuccess: { type: "boolean" },
      telegramNotifyOnFail: { type: "boolean" },
      twitchClientId: { type: "string" },
      twitchClientSecret: { type: "string" },
      downloadFilenamePresetId: {
        type: "string",
        enum: ["legacy", "channel_year_date_index", "playlist_static_index", "playlist_static_date", "custom"],
      },
      downloadFilenameTemplate: { type: "string" },
      mediaServerExportMode: { type: "string", enum: ["off", "nfo", "nfo_and_source_json"] },
      statisticsEnabled: { type: "boolean" },
      statisticsRetentionDays: nullable({ type: "integer" }),
      statisticsCaptureSearchText: { type: "boolean" },
      statisticsTrackVisitorActivity: { type: "boolean" },
      statisticsKeepDataWhenDisabled: { type: "boolean" },
      statisticsTimezone: { type: "string" },
    },
    ["loginEnabled", "defaultAutoPlay", "defaultAutoLoop", "maxConcurrentDownloads", "language"],
    { additionalProperties: true }
  ),
  SettingsPatchRequest: objectSchema({}, [], {
    additionalProperties: true,
    description: "Partial Settings object. Secret fields can be included by admins.",
  }),
  RssFilters: objectSchema({
    authors: { type: "array", items: { type: "string" } },
    channelUrls: { type: "array", items: { type: "string" } },
    tags: { type: "array", items: { type: "string" } },
    sources: {
      type: "array",
      items: { type: "string", enum: ["youtube", "bilibili", "twitch", "local", "missav", "cloud"] },
    },
    dayRange: { type: "integer", minimum: 1 },
    maxItems: { type: "integer", minimum: 1, maximum: 200 },
  }),
  RssToken: objectSchema(
    {
      id: { type: "string" },
      label: { type: "string" },
      role: { type: "string", enum: ["admin", "visitor"] },
      filters: schemaRef("RssFilters"),
      isActive: { type: "boolean" },
      accessCount: { type: "integer" },
      lastAccessedAt: { type: "integer", nullable: true },
      createdAt: { type: "integer" },
      updatedAt: { type: "integer" },
      feedUrl: { type: "string" },
    },
    ["id", "label", "role", "filters", "isActive", "createdAt", "updatedAt", "feedUrl"]
  ),
  SearchResult: objectSchema(
    {
      id: { type: "string" },
      title: { type: "string" },
      url: { type: "string" },
      thumbnail: { type: "string", nullable: true },
      duration: { type: "string", nullable: true },
      author: { type: "string", nullable: true },
      uploadDate: { type: "string", nullable: true },
      viewCount: { type: "integer", nullable: true },
    },
    ["title", "url"],
    { additionalProperties: true }
  ),
  VideoDownloadCheckResult: objectSchema({
    found: { type: "boolean" },
    status: { type: "string", enum: ["exists", "deleted"], nullable: true },
    videoId: { type: "string", nullable: true },
    title: { type: "string", nullable: true },
    author: { type: "string", nullable: true },
    downloadedAt: { type: "integer", nullable: true },
    deletedAt: { type: "integer", nullable: true },
  }, ["found"]),
  PlaylistInfo: objectSchema({
    isPlaylist: { type: "boolean" },
    title: { type: "string", nullable: true },
    videoCount: { type: "integer", nullable: true },
    collectionInfo: { type: "object", additionalProperties: true, nullable: true },
  }, ["isPlaylist"], { additionalProperties: true }),
  BilibiliPartsInfo: objectSchema({
    hasParts: { type: "boolean" },
    parts: { type: "array", items: { type: "object", additionalProperties: true } },
  }, ["hasParts"], { additionalProperties: true }),
  BilibiliCollectionInfo: objectSchema({
    isCollection: { type: "boolean" },
    collectionInfo: { type: "object", additionalProperties: true, nullable: true },
  }, ["isCollection"], { additionalProperties: true }),
  CloudSignedUrlResponse: objectSchema({
    signedUrl: { type: "string" },
    url: { type: "string" },
    cacheUrl: { type: "string" },
    filename: { type: "string" },
    type: { type: "string", enum: ["video", "thumbnail"] },
  }, [], { additionalProperties: true }),
  SystemVersionResponse: objectSchema({
    currentVersion: { type: "string" },
    latestVersion: { type: "string", nullable: true },
    releaseUrl: { type: "string", nullable: true },
    hasUpdate: { type: "boolean" },
    error: { type: "string", nullable: true },
  }, ["currentVersion", "hasUpdate"], { additionalProperties: true }),
  PasswordEnabledResponse: objectSchema({
    enabled: { type: "boolean" },
    loginEnabled: { type: "boolean" },
    passwordLoginAllowed: { type: "boolean" },
    isPasswordSet: { type: "boolean" },
    visitorUserEnabled: { type: "boolean" },
    isVisitorPasswordSet: { type: "boolean" },
  }, [], { additionalProperties: true }),
  AuthResponse: objectSchema({
    success: { type: "boolean" },
    role: { type: "string", enum: ["admin", "visitor"] },
    token: { type: "string" },
    message: { type: "string" },
  }, ["success"], { additionalProperties: true }),
  PasskeySummary: objectSchema({
    id: { type: "string" },
    userName: { type: "string" },
    createdAt: { type: "integer" },
    lastUsedAt: { type: "integer", nullable: true },
  }, ["id", "userName", "createdAt"], { additionalProperties: true }),
  StatisticsOverview: objectSchema({}, [], { additionalProperties: true }),
  StatisticsTimeseries: objectSchema({
    metric: { type: "string" },
    points: { type: "array", items: { type: "object", additionalProperties: true } },
  }, ["points"], { additionalProperties: true }),
  StatisticsRanking: objectSchema({
    metric: { type: "string" },
    items: { type: "array", items: { type: "object", additionalProperties: true } },
  }, ["items"], { additionalProperties: true }),
  StatisticsHealth: objectSchema({}, [], { additionalProperties: true }),
  MergeSummary: objectSchema({}, [], {
    additionalProperties: objectSchema({
      merged: { type: "integer" },
      skipped: { type: "integer" },
    }, ["merged", "skipped"]),
  }),
  FilenameTemplateWarning: objectSchema({
    code: { type: "string" },
    message: { type: "string" },
  }, ["code", "message"]),
  FilenameTemplatePreset: objectSchema({
    id: {
      type: "string",
      enum: ["legacy", "channel_year_date_index", "playlist_static_index", "playlist_static_date", "custom"],
    },
    labelKey: { type: "string" },
    descriptionKey: { type: "string" },
    template: { type: "string" },
  }, ["id", "template"], { additionalProperties: true }),
  FilenameTemplatePreview: objectSchema({
    videoPath: { type: "string" },
    thumbnailPath: { type: "string" },
    subtitlePath: { type: "string" },
    warnings: arrayOf("FilenameTemplateWarning"),
    errors: { type: "array", items: { type: "string" } },
    valid: { type: "boolean" },
    rendered: nullable(objectSchema({
      videoPath: { type: "string" },
      thumbnailPath: { type: "string" },
      subtitlePath: { type: "string" },
    })),
  }, [], { additionalProperties: true }),
  RenameJobItem: objectSchema({
    videoId: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: ["pending", "success", "skipped", "failed"] },
    skipReason: { type: "string", nullable: true },
    error: { type: "string", nullable: true },
    oldVideoPath: { type: "string", nullable: true },
    newVideoPath: { type: "string", nullable: true },
  }, ["videoId", "title", "status"]),
  RenameJob: objectSchema({
    id: { type: "string" },
    status: { type: "string", enum: ["running", "completed", "failed", "cancelled"] },
    lockedAt: { type: "integer" },
    template: { type: "string" },
    total: { type: "integer" },
    processed: { type: "integer" },
    succeeded: { type: "integer" },
    skipped: { type: "integer" },
    failed: { type: "integer" },
    currentVideoId: { type: "string", nullable: true },
    currentTitle: { type: "string", nullable: true },
    items: arrayOf("RenameJobItem"),
    cancelRequested: { type: "boolean" },
  }, ["id", "status", "lockedAt", "template", "total", "processed", "succeeded", "skipped", "failed", "items"]),
  RenameJobStartResponse: objectSchema({
    jobId: { type: "string" },
    status: { type: "string", enum: ["running", "completed", "failed", "cancelled"] },
    total: { type: "integer" },
  }, ["jobId", "status", "total"]),
  MediaServerExportJobItem: objectSchema({
    videoId: { type: "string" },
    title: { type: "string" },
    status: { type: "string", enum: ["pending", "success", "skipped", "failed"] },
    skipReason: { type: "string", nullable: true },
    error: { type: "string", nullable: true },
  }, ["videoId", "title", "status"]),
  MediaServerExportJob: objectSchema({
    id: { type: "string" },
    status: { type: "string", enum: ["running", "completed", "failed", "cancelled"] },
    lockedAt: { type: "integer" },
    mode: { type: "string", enum: ["off", "nfo", "nfo_and_source_json"] },
    action: { type: "string", enum: ["rebuild", "cleanup"] },
    total: { type: "integer" },
    processed: { type: "integer" },
    succeeded: { type: "integer" },
    skipped: { type: "integer" },
    failed: { type: "integer" },
    currentVideoId: { type: "string", nullable: true },
    currentTitle: { type: "string", nullable: true },
    items: arrayOf("MediaServerExportJobItem"),
    cancelRequested: { type: "boolean" },
  }, ["id", "status", "lockedAt", "mode", "action", "total", "processed", "succeeded", "skipped", "failed", "items"]),
  MediaServerExportStartResponse: objectSchema({
    jobId: { type: "string" },
    status: { type: "string", enum: ["running", "completed", "failed", "cancelled"] },
    action: { type: "string", enum: ["rebuild", "cleanup"] },
    mode: { type: "string", enum: ["off", "nfo", "nfo_and_source_json"] },
    total: { type: "integer" },
    processed: { type: "integer" },
    succeeded: { type: "integer" },
    skipped: { type: "integer" },
    failed: { type: "integer" },
  }, ["jobId", "status", "action", "mode", "total", "processed", "succeeded", "skipped", "failed"]),
};

const requestSchemas: Record<string, SchemaObject> = {
  DownloadRequest: objectSchema({
    youtubeUrl: { type: "string" },
    downloadAllParts: { type: "boolean" },
    collectionName: { type: "string" },
    downloadCollection: { type: "boolean" },
    collectionInfo: { type: "object", additionalProperties: true },
    forceDownload: { type: "boolean" },
  }, ["youtubeUrl"]),
  UpdateVideoRequest: objectSchema({
    title: { type: "string" },
    tags: { type: "array", items: { type: "string" } },
    visibility: { type: "integer", enum: [0, 1] },
    subtitles: arrayOf("VideoSubtitle"),
  }),
  RateVideoRequest: objectSchema({ rating: { type: "integer", minimum: 1, maximum: 5 } }, ["rating"]),
  UpdateProgressRequest: objectSchema({ progress: { type: "number", minimum: 0 } }, ["progress"]),
  ChannelPlaylistsRequest: objectSchema({ url: { type: "string" } }, ["url"]),
  CreateCollectionRequest: objectSchema({
    name: { type: "string" },
    videoId: { type: "string" },
  }, ["name"]),
  UpdateCollectionRequest: objectSchema({
    name: { type: "string" },
    videoId: { type: "string" },
    action: { type: "string", enum: ["add", "remove"] },
  }),
  CreateSubscriptionRequest: objectSchema({
    url: { type: "string" },
    interval: { type: "integer", minimum: 1 },
    authorName: { type: "string" },
    downloadAllPrevious: { type: "boolean" },
    downloadShorts: { type: "boolean" },
    downloadOrder: { type: "string", enum: ["dateDesc", "dateAsc", "viewsDesc", "viewsAsc"] },
  }, ["url", "interval"]),
  UpdateSubscriptionRequest: objectSchema({
    interval: { type: "integer", minimum: 1 },
    retentionDays: nullable({ type: "integer", minimum: 1 }),
  }),
  CreatePlaylistSubscriptionRequest: objectSchema({
    playlistUrl: { type: "string" },
    interval: { type: "integer", minimum: 1 },
    collectionName: { type: "string" },
    downloadAll: { type: "boolean" },
    collectionInfo: { type: "object", additionalProperties: true },
  }, ["playlistUrl", "interval", "collectionName"]),
  CreateChannelPlaylistsSubscriptionRequest: objectSchema({
    url: { type: "string" },
    interval: { type: "integer", minimum: 1 },
    downloadAllPrevious: { type: "boolean" },
  }, ["url", "interval"]),
  CreatePlaylistTaskRequest: objectSchema({
    playlistUrl: { type: "string" },
    collectionName: { type: "string" },
  }, ["playlistUrl", "collectionName"]),
  CreateRssTokenRequest: objectSchema({
    label: { type: "string" },
    role: { type: "string", enum: ["admin", "visitor"] },
    filters: schemaRef("RssFilters"),
  }, ["label", "role"]),
  UpdateRssTokenRequest: objectSchema({
    label: { type: "string" },
    filters: schemaRef("RssFilters"),
    isActive: { type: "boolean" },
  }),
  RenameTagRequest: objectSchema({
    oldTag: { type: "string" },
    newTag: { type: "string" },
  }, ["oldTag", "newTag"]),
  TelegramTestRequest: objectSchema({
    botToken: { type: "string" },
    chatId: { type: "string" },
  }, ["botToken", "chatId"]),
  PasswordRequest: objectSchema({ password: { type: "string", format: "password" } }, ["password"]),
  PasskeyRegistrationRequest: objectSchema({ userName: { type: "string" } }),
  PasskeyVerifyRequest: objectSchema({
    body: { type: "object", additionalProperties: true },
    challenge: { type: "string" },
  }, ["body", "challenge"]),
  ScanMountDirectoriesRequest: objectSchema({
    directories: { type: "array", minItems: 1, items: { type: "string" } },
  }, ["directories"]),
  StatisticsEventsRequest: objectSchema({
    events: { type: "array", items: { type: "object", additionalProperties: true } },
  }, ["events"], { additionalProperties: true }),
  FilenameTemplateRequest: objectSchema({
    template: { type: "string" },
    sourceCollectionType: { type: "string", enum: ["channel", "playlist", "single", "unknown"] },
  }, ["template"]),
  BatchRenameRequest: objectSchema({
    downloadFilenamePresetId: {
      type: "string",
      enum: ["legacy", "channel_year_date_index", "playlist_static_index", "playlist_static_date", "custom"],
    },
    downloadFilenameTemplate: { type: "string" },
    moveThumbnailsToVideoFolder: { type: "boolean" },
    moveSubtitlesToVideoFolder: { type: "boolean" },
  }),
  MediaServerExportRebuildRequest: objectSchema({
    mediaServerExportMode: { type: "string", enum: ["off", "nfo", "nfo_and_source_json"] },
  }),
};

const responseSchemas: Record<string, SchemaObject> = {
  VideoListResponse: arrayOf("Video"),
  CollectionListResponse: arrayOf("Collection"),
  SubscriptionListResponse: arrayOf("Subscription"),
  ContinuousDownloadTaskListResponse: arrayOf("ContinuousDownloadTask"),
  DownloadHistoryResponse: arrayOf("DownloadHistoryItem"),
  SearchResponse: objectSchema({
    results: arrayOf("SearchResult"),
    videos: arrayOf("SearchResult"),
  }, [], { additionalProperties: true }),
  UploadVideoResponse: successSchema(schemaRef("Video")),
  UploadBatchResponse: objectSchema({
    results: {
      type: "array",
      items: objectSchema({
        originalName: { type: "string" },
        status: { type: "string", enum: ["uploaded", "duplicate", "failed"] },
        message: { type: "string" },
        video: schemaRef("Video"),
      }, ["originalName", "status", "message"]),
    },
    summary: objectSchema({
      total: { type: "integer" },
      uploaded: { type: "integer" },
      duplicates: { type: "integer" },
      failed: { type: "integer" },
    }, ["total", "uploaded", "duplicates", "failed"]),
  }, ["results", "summary"]),
  CommentsResponse: arrayOf("Comment"),
  RssTokenListResponse: arrayOf("RssToken"),
  MergeSummaryResponse: objectSchema({
    success: { type: "boolean" },
    summary: schemaRef("MergeSummary"),
    message: { type: "string" },
  }, ["summary"], { additionalProperties: true }),
  PasskeyListResponse: arrayOf("PasskeySummary"),
  PasskeyExistsResponse: objectSchema({ exists: { type: "boolean" } }, ["exists"]),
  PasskeyOptionsResponse: objectSchema({}, [], { additionalProperties: true }),
  CookiesStatusResponse: objectSchema({ exists: { type: "boolean" } }, ["exists"]),
  HookStatusResponse: objectSchema({}, [], { additionalProperties: true }),
  LastBackupInfoResponse: objectSchema({
    exists: { type: "boolean" },
    filename: { type: "string", nullable: true },
    createdAt: { type: "integer", nullable: true },
    size: { type: "integer", nullable: true },
  }, ["exists"], { additionalProperties: true }),
  CloudSyncEvent: objectSchema({}, [], { additionalProperties: true }),
  FilenameTemplatePresetsResponse: objectSchema({
    presets: arrayOf("FilenameTemplatePreset"),
  }, ["presets"]),
};

const schemas = {
  ...commonSchemas,
  ...requestSchemas,
  ...responseSchemas,
};

const stringQuery = (name: string, required = false, description?: string): OpenApiParameter => ({
  in: "query",
  name,
  required,
  description,
  schema: { type: "string" },
});

const integerQuery = (name: string, required = false, description?: string): OpenApiParameter => ({
  in: "query",
  name,
  required,
  description,
  schema: { type: "integer" },
});

const booleanQuery = (name: string, required = false, description?: string): OpenApiParameter => ({
  in: "query",
  name,
  required,
  description,
  schema: { type: "boolean" },
});

const settingsRoutes: DocumentedRoute[] = [
  { method: "get", path: "/api/settings" },
  { method: "patch", path: "/api/settings" },
  { method: "post", path: "/api/settings/migrate" },
  { method: "post", path: "/api/settings/delete-legacy" },
  { method: "post", path: "/api/settings/format-filenames" },
  { method: "get", path: "/api/settings/cloudflared/status" },
  { method: "post", path: "/api/settings/tags/rename" },
  { method: "get", path: "/api/settings/password-enabled", public: true },
  { method: "post", path: "/api/settings/verify-password", public: true },
  { method: "post", path: "/api/settings/verify-admin-password", public: true },
  { method: "post", path: "/api/settings/verify-visitor-password", public: true },
  { method: "post", path: "/api/settings/confirm-admin-password" },
  { method: "post", path: "/api/settings/logout", public: true },
  { method: "get", path: "/api/settings/passkeys" },
  { method: "get", path: "/api/settings/passkeys/exists", public: true },
  { method: "post", path: "/api/settings/passkeys/register", public: true },
  { method: "post", path: "/api/settings/passkeys/register/verify", public: true },
  { method: "post", path: "/api/settings/passkeys/authenticate", public: true },
  { method: "post", path: "/api/settings/passkeys/authenticate/verify", public: true },
  { method: "delete", path: "/api/settings/passkeys" },
  { method: "post", path: "/api/settings/upload-cookies" },
  { method: "post", path: "/api/settings/delete-cookies" },
  { method: "get", path: "/api/settings/check-cookies" },
  { method: "post", path: "/api/settings/telegram/test" },
  { method: "post", path: "/api/settings/tmdb/test" },
  { method: "post", path: "/api/settings/hooks/:name" },
  { method: "delete", path: "/api/settings/hooks/:name" },
  { method: "get", path: "/api/settings/hooks/status" },
  { method: "get", path: "/api/settings/export-database" },
  { method: "post", path: "/api/settings/import-database" },
  { method: "post", path: "/api/settings/merge-database-preview" },
  { method: "post", path: "/api/settings/merge-database" },
  { method: "post", path: "/api/settings/cleanup-backup-databases" },
  { method: "get", path: "/api/settings/last-backup-info" },
  { method: "post", path: "/api/settings/restore-from-last-backup" },
  { method: "get", path: "/api/settings/filename-template/presets" },
  { method: "post", path: "/api/settings/filename-template/validate" },
  { method: "post", path: "/api/settings/filename-template/preview" },
  { method: "post", path: "/api/settings/filename-template/rename-all" },
  { method: "get", path: "/api/settings/filename-template/rename-jobs/:jobId" },
  { method: "post", path: "/api/settings/filename-template/rename-jobs/:jobId/cancel" },
  { method: "post", path: "/api/settings/media-server-export/rebuild" },
  { method: "get", path: "/api/settings/media-server-export/jobs/:jobId" },
  { method: "post", path: "/api/settings/media-server-export/jobs/:jobId/cancel" },
];

const feedRoutes: DocumentedRoute[] = [
  { method: "get", path: "/feed/:token", public: true },
  { method: "get", path: "/api/rss/feed/:token", public: true },
];

const staticAndRedirectRoutes: DocumentedRoute[] = [
  { method: "get", path: "/cloud/videos/:filename", public: true },
  { method: "get", path: "/cloud/images/:filename", public: true },
  { method: "get", path: "/api/cloud/thumbnail-cache/:filename" },
];

const routeSpecs: Record<string, RouteSpec> = {
  "GET /feed/:token": {
    summary: "Get RSS feed",
    description: "Public RSS 2.0 feed. The path token is the bearer credential.",
    response: { type: "string", format: "xml" },
    responseContentType: "application/xml",
    tags: ["feed"],
  },
  "GET /api/rss/feed/:token": {
    summary: "Get RSS feed through API path",
    description: "Public RSS 2.0 feed. The path token is the bearer credential.",
    response: { type: "string", format: "xml" },
    responseContentType: "application/xml",
    tags: ["rss"],
  },
  "GET /api/search": {
    summary: "Search online videos",
    query: [stringQuery("query", true), integerQuery("limit"), integerQuery("offset")],
    response: "SearchResponse",
    tags: ["download"],
  },
  "POST /api/download": {
    summary: "Queue video download",
    request: "DownloadRequest",
    response: "MessageResponse",
    tags: ["download"],
  },
  "POST /api/upload": {
    summary: "Upload one local video",
    requestContentType: "multipart/form-data",
    request: objectSchema({
      video: { type: "string", format: "binary" },
      title: { type: "string" },
      author: { type: "string" },
    }, ["video"]),
    response: "UploadVideoResponse",
    tags: ["videos"],
  },
  "POST /api/upload/batch": {
    summary: "Upload multiple local videos",
    requestContentType: "multipart/form-data",
    request: objectSchema({
      videos: { type: "array", items: { type: "string", format: "binary" } },
      title: { type: "string" },
      author: { type: "string" },
    }, ["videos"]),
    response: "UploadBatchResponse",
    tags: ["videos"],
  },
  "GET /api/videos": { summary: "List videos", response: "VideoListResponse", tags: ["videos"] },
  "GET /api/videos/:id": { summary: "Get video", response: "Video", tags: ["videos"] },
  "GET /api/mount-video/:id": {
    summary: "Stream mounted video",
    response: { type: "string", format: "binary" },
    responseContentType: "application/octet-stream",
    tags: ["videos"],
  },
  "PUT /api/videos/:id": { summary: "Update video", request: "UpdateVideoRequest", response: "Video", tags: ["videos"] },
  "POST /api/videos/:id/subtitles": {
    summary: "Upload subtitle",
    requestContentType: "multipart/form-data",
    request: objectSchema({
      subtitle: { type: "string", format: "binary" },
      language: { type: "string" },
    }, ["subtitle"]),
    response: "Video",
    tags: ["videos"],
  },
  "DELETE /api/videos/:id": { summary: "Delete video", response: "MessageResponse", tags: ["videos"] },
  "GET /api/videos/:id/comments": { summary: "Get video comments", response: "CommentsResponse", tags: ["videos"] },
  "GET /api/videos/author-channel-url": {
    summary: "Resolve author channel URL",
    query: [stringQuery("sourceUrl", true)],
    response: objectSchema({ channelUrl: { type: "string", nullable: true } }, [], { additionalProperties: true }),
    tags: ["videos"],
  },
  "POST /api/videos/:id/rate": { summary: "Rate video", request: "RateVideoRequest", response: "Video", tags: ["videos"] },
  "POST /api/videos/:id/refresh-thumbnail": { summary: "Refresh video thumbnail", response: "MessageResponse", tags: ["videos"] },
  "POST /api/videos/:id/redownload-thumbnail": { summary: "Redownload video thumbnail", response: "MessageResponse", tags: ["videos"] },
  "POST /api/videos/:id/upload-thumbnail": {
    summary: "Upload custom thumbnail",
    requestContentType: "multipart/form-data",
    request: objectSchema({ thumbnail: { type: "string", format: "binary" } }, ["thumbnail"]),
    response: "MessageResponse",
    tags: ["videos"],
  },
  "POST /api/videos/refresh-file-sizes": { summary: "Refresh video file sizes", response: "MessageResponse", tags: ["videos"] },
  "POST /api/videos/:id/view": { summary: "Increment view count", response: "Video", tags: ["videos"] },
  "PUT /api/videos/:id/progress": { summary: "Save playback progress", request: "UpdateProgressRequest", response: "MessageResponse", tags: ["videos"] },
  "POST /api/scan-files": { summary: "Scan local video files", response: "MessageResponse", tags: ["maintenance"] },
  "POST /api/scan-mount-directories": { summary: "Scan mount directories", request: "ScanMountDirectoriesRequest", response: "MessageResponse", tags: ["maintenance"] },
  "POST /api/cleanup-temp-files": { summary: "Clean temporary download files", response: "MessageResponse", tags: ["maintenance"] },
  "GET /api/download-status": { summary: "Get download status", response: "DownloadStatus", tags: ["download"] },
  "GET /api/check-video-download": { summary: "Check downloaded source URL", query: [stringQuery("url", true)], response: "VideoDownloadCheckResult", tags: ["download"] },
  "GET /api/check-bilibili-parts": { summary: "Check Bilibili parts", query: [stringQuery("url", true)], response: "BilibiliPartsInfo", tags: ["download"] },
  "GET /api/check-bilibili-collection": { summary: "Check Bilibili collection", query: [stringQuery("url", true)], response: "BilibiliCollectionInfo", tags: ["download"] },
  "GET /api/check-playlist": { summary: "Check playlist URL", query: [stringQuery("url", true)], response: "PlaylistInfo", tags: ["download"] },
  "POST /api/downloads/channel-playlists": { summary: "Download channel playlists", request: "ChannelPlaylistsRequest", response: "MessageResponse", tags: ["download"] },
  "POST /api/downloads/cancel/:id": { summary: "Cancel active download", response: "MessageResponse", tags: ["download"] },
  "DELETE /api/downloads/queue/:id": { summary: "Remove queued download", response: "MessageResponse", tags: ["download"] },
  "DELETE /api/downloads/queue": { summary: "Clear download queue", response: "MessageResponse", tags: ["download"] },
  "GET /api/downloads/history": { summary: "List download history", response: "DownloadHistoryResponse", tags: ["download"] },
  "DELETE /api/downloads/history/:id": { summary: "Delete download history item", response: "MessageResponse", tags: ["download"] },
  "DELETE /api/downloads/history": { summary: "Clear download history", response: "MessageResponse", tags: ["download"] },
  "GET /api/collections": { summary: "List collections", response: "CollectionListResponse", tags: ["collections"] },
  "POST /api/collections": { summary: "Create collection", request: "CreateCollectionRequest", response: "Collection", tags: ["collections"] },
  "PUT /api/collections/:id": { summary: "Update collection", request: "UpdateCollectionRequest", response: "Collection", tags: ["collections"] },
  "DELETE /api/collections/:id": { summary: "Delete collection", query: [booleanQuery("deleteVideos")], response: "MessageResponse", tags: ["collections"] },
  "POST /api/subscriptions": { summary: "Create subscription", request: "CreateSubscriptionRequest", response: "Subscription", tags: ["subscriptions"] },
  "GET /api/subscriptions": { summary: "List subscriptions", response: "SubscriptionListResponse", tags: ["subscriptions"] },
  "PUT /api/subscriptions/:id": { summary: "Update subscription", request: "UpdateSubscriptionRequest", response: "Subscription", tags: ["subscriptions"] },
  "DELETE /api/subscriptions/:id": { summary: "Delete subscription", response: "MessageResponse", tags: ["subscriptions"] },
  "PUT /api/subscriptions/:id/pause": { summary: "Pause subscription", response: "Subscription", tags: ["subscriptions"] },
  "PUT /api/subscriptions/:id/resume": { summary: "Resume subscription", response: "Subscription", tags: ["subscriptions"] },
  "POST /api/subscriptions/playlist": { summary: "Create playlist subscription", request: "CreatePlaylistSubscriptionRequest", response: "Subscription", tags: ["subscriptions"] },
  "POST /api/subscriptions/channel-playlists": { summary: "Subscribe channel playlists", request: "CreateChannelPlaylistsSubscriptionRequest", response: "MessageResponse", tags: ["subscriptions"] },
  "GET /api/subscriptions/tasks": { summary: "List continuous download tasks", response: "ContinuousDownloadTaskListResponse", tags: ["tasks"] },
  "DELETE /api/subscriptions/tasks/clear-finished": { summary: "Clear finished tasks", response: "MessageResponse", tags: ["tasks"] },
  "PUT /api/subscriptions/tasks/:id/pause": { summary: "Pause task", response: "ContinuousDownloadTask", tags: ["tasks"] },
  "PUT /api/subscriptions/tasks/:id/resume": { summary: "Resume task", response: "ContinuousDownloadTask", tags: ["tasks"] },
  "DELETE /api/subscriptions/tasks/:id": { summary: "Cancel task", response: "MessageResponse", tags: ["tasks"] },
  "DELETE /api/subscriptions/tasks/:id/delete": { summary: "Delete task record", response: "MessageResponse", tags: ["tasks"] },
  "POST /api/subscriptions/tasks/playlist": { summary: "Create playlist task", request: "CreatePlaylistTaskRequest", response: "ContinuousDownloadTask", tags: ["tasks"] },
  "GET /api/cloud/signed-url": {
    summary: "Get cloud signed URL",
    query: [stringQuery("filename", true), {
      in: "query",
      name: "type",
      schema: { type: "string", enum: ["video", "thumbnail"] },
    }],
    response: "CloudSignedUrlResponse",
    tags: ["cloud"],
  },
  "POST /api/cloud/sync": {
    summary: "Sync cloud storage",
    description: "Streams newline-delimited JSON progress events.",
    response: "CloudSyncEvent",
    tags: ["cloud"],
  },
  "DELETE /api/cloud/thumbnail-cache": { summary: "Clear cloud thumbnail cache", response: "MessageResponse", tags: ["cloud"] },
  "GET /api/cloud/thumbnail-cache/:filename": {
    summary: "Get cached cloud thumbnail",
    response: { type: "string", format: "binary" },
    responseContentType: "application/octet-stream",
    tags: ["cloud"],
  },
  "GET /cloud/videos/:filename": {
    summary: "Redirect to cloud video",
    response: { type: "string" },
    responseContentType: "text/plain",
    responses: {
      "302": { type: "string", description: "Redirect to signed cloud video URL" },
    },
    tags: ["cloud"],
  },
  "GET /cloud/images/:filename": {
    summary: "Redirect to cloud image",
    response: { type: "string", format: "binary" },
    responseContentType: "application/octet-stream",
    responses: {
      "302": { type: "string", description: "Redirect to signed cloud image URL" },
    },
    tags: ["cloud"],
  },
  "GET /api/system/version": { summary: "Get version information", response: "SystemVersionResponse", tags: ["system"] },
  "POST /api/statistics/events": { summary: "Ingest statistics events", request: "StatisticsEventsRequest", response: "MessageResponse", tags: ["statistics"] },
  "GET /api/statistics/overview": { summary: "Get statistics overview", response: "StatisticsOverview", tags: ["statistics"] },
  "GET /api/statistics/timeseries/:metric": { summary: "Get statistics timeseries", response: "StatisticsTimeseries", tags: ["statistics"] },
  "GET /api/statistics/rankings/:metric": { summary: "Get statistics ranking", response: "StatisticsRanking", tags: ["statistics"] },
  "GET /api/statistics/health": { summary: "Get statistics health", response: "StatisticsHealth", tags: ["statistics"] },
  "GET /api/statistics/export": { summary: "Export statistics", response: { type: "object", additionalProperties: true }, tags: ["statistics"] },
  "POST /api/statistics/recompute": { summary: "Recompute statistics", response: "MessageResponse", tags: ["statistics"] },
  "DELETE /api/statistics": { summary: "Clear statistics", response: "MessageResponse", tags: ["statistics"] },
  "GET /api/rss/tokens": { summary: "List RSS tokens", response: "RssTokenListResponse", tags: ["rss"] },
  "POST /api/rss/tokens": { summary: "Create RSS token", request: "CreateRssTokenRequest", response: "RssToken", tags: ["rss"] },
  "PUT /api/rss/tokens/:id": { summary: "Update RSS token", request: "UpdateRssTokenRequest", response: "RssToken", tags: ["rss"] },
  "DELETE /api/rss/tokens/:id": { summary: "Delete RSS token", response: "MessageResponse", tags: ["rss"] },
  "POST /api/rss/tokens/:id/reset": { summary: "Rotate RSS token", response: "RssToken", tags: ["rss"] },
  "GET /api/settings": { summary: "Get settings", response: "Settings", tags: ["settings"] },
  "PATCH /api/settings": { summary: "Update settings", request: "SettingsPatchRequest", response: "Settings", tags: ["settings"] },
  "POST /api/settings/migrate": { summary: "Migrate legacy data", response: "MessageResponse", tags: ["settings"] },
  "POST /api/settings/delete-legacy": { summary: "Delete legacy data", response: "MessageResponse", tags: ["settings"] },
  "POST /api/settings/format-filenames": { summary: "Format filenames", response: "MessageResponse", tags: ["settings"] },
  "GET /api/settings/cloudflared/status": { summary: "Get Cloudflared status", response: { type: "object", additionalProperties: true }, tags: ["settings"] },
  "POST /api/settings/tags/rename": { summary: "Rename tag", request: "RenameTagRequest", response: "MessageResponse", tags: ["settings"] },
  "GET /api/settings/password-enabled": { summary: "Check password login status", response: "PasswordEnabledResponse", tags: ["auth"] },
  "POST /api/settings/verify-password": { summary: "Verify password", request: "PasswordRequest", response: "AuthResponse", tags: ["auth"] },
  "POST /api/settings/verify-admin-password": { summary: "Verify admin password", request: "PasswordRequest", response: "AuthResponse", tags: ["auth"] },
  "POST /api/settings/verify-visitor-password": { summary: "Verify visitor password", request: "PasswordRequest", response: "AuthResponse", tags: ["auth"] },
  "POST /api/settings/confirm-admin-password": { summary: "Confirm admin password", request: "PasswordRequest", response: "AuthResponse", tags: ["auth"] },
  "POST /api/settings/logout": { summary: "Logout", response: "MessageResponse", tags: ["auth"] },
  "GET /api/settings/passkeys": { summary: "List passkeys", response: "PasskeyListResponse", tags: ["passkeys"] },
  "GET /api/settings/passkeys/exists": { summary: "Check passkey existence", response: "PasskeyExistsResponse", tags: ["passkeys"] },
  "POST /api/settings/passkeys/register": { summary: "Generate passkey registration options", request: "PasskeyRegistrationRequest", response: "PasskeyOptionsResponse", tags: ["passkeys"] },
  "POST /api/settings/passkeys/register/verify": { summary: "Verify passkey registration", request: "PasskeyVerifyRequest", response: "AuthResponse", tags: ["passkeys"] },
  "POST /api/settings/passkeys/authenticate": { summary: "Generate passkey authentication options", response: "PasskeyOptionsResponse", tags: ["passkeys"] },
  "POST /api/settings/passkeys/authenticate/verify": { summary: "Verify passkey authentication", request: "PasskeyVerifyRequest", response: "AuthResponse", tags: ["passkeys"] },
  "DELETE /api/settings/passkeys": { summary: "Remove all passkeys", response: "MessageResponse", tags: ["passkeys"] },
  "POST /api/settings/upload-cookies": { summary: "Upload cookies file", requestContentType: "multipart/form-data", request: fileUploadSchema(), response: "MessageResponse", tags: ["settings"] },
  "POST /api/settings/delete-cookies": { summary: "Delete cookies file", response: "MessageResponse", tags: ["settings"] },
  "GET /api/settings/check-cookies": { summary: "Check cookies file", response: "CookiesStatusResponse", tags: ["settings"] },
  "POST /api/settings/telegram/test": { summary: "Test Telegram notification", request: "TelegramTestRequest", response: "MessageResponse", tags: ["settings"] },
  "POST /api/settings/tmdb/test": { summary: "Test TMDB credentials", response: "MessageResponse", tags: ["settings"] },
  "POST /api/settings/hooks/:name": { summary: "Upload hook script", requestContentType: "multipart/form-data", request: fileUploadSchema(), response: "MessageResponse", tags: ["hooks"] },
  "DELETE /api/settings/hooks/:name": { summary: "Delete hook script", response: "MessageResponse", tags: ["hooks"] },
  "GET /api/settings/hooks/status": { summary: "Get hook status", response: "HookStatusResponse", tags: ["hooks"] },
  "GET /api/settings/export-database": { summary: "Export database", response: { type: "string", format: "binary" }, responseContentType: "application/octet-stream", tags: ["database"] },
  "POST /api/settings/import-database": { summary: "Import database", requestContentType: "multipart/form-data", request: fileUploadSchema(), response: "MessageResponse", tags: ["database"] },
  "POST /api/settings/merge-database-preview": { summary: "Preview database merge", requestContentType: "multipart/form-data", request: fileUploadSchema(), response: "MergeSummaryResponse", tags: ["database"] },
  "POST /api/settings/merge-database": { summary: "Merge database", requestContentType: "multipart/form-data", request: fileUploadSchema(), response: "MergeSummaryResponse", tags: ["database"] },
  "POST /api/settings/cleanup-backup-databases": { summary: "Cleanup backup databases", response: "MessageResponse", tags: ["database"] },
  "GET /api/settings/last-backup-info": { summary: "Get last backup info", response: "LastBackupInfoResponse", tags: ["database"] },
  "POST /api/settings/restore-from-last-backup": { summary: "Restore last backup", response: "MessageResponse", tags: ["database"] },
  "GET /api/settings/filename-template/presets": {
    summary: "List filename template presets",
    response: "FilenameTemplatePresetsResponse",
    tags: ["filename-template"],
  },
  "POST /api/settings/filename-template/validate": {
    summary: "Validate filename template",
    request: "FilenameTemplateRequest",
    response: "FilenameTemplatePreview",
    tags: ["filename-template"],
  },
  "POST /api/settings/filename-template/preview": {
    summary: "Preview filename template",
    request: "FilenameTemplateRequest",
    response: "FilenameTemplatePreview",
    tags: ["filename-template"],
  },
  "POST /api/settings/filename-template/rename-all": {
    summary: "Start batch filename rename",
    request: "BatchRenameRequest",
    response: "RenameJobStartResponse",
    responses: {
      "202": "RenameJobStartResponse",
      "409": "ApiError",
    },
    tags: ["filename-template"],
  },
  "GET /api/settings/filename-template/rename-jobs/:jobId": {
    summary: "Get batch rename job",
    response: "RenameJob",
    tags: ["filename-template"],
  },
  "POST /api/settings/filename-template/rename-jobs/:jobId/cancel": {
    summary: "Cancel batch rename job",
    response: "MessageResponse",
    tags: ["filename-template"],
  },
  "POST /api/settings/media-server-export/rebuild": {
    summary: "Start media server sidecar rebuild",
    request: "MediaServerExportRebuildRequest",
    response: "MediaServerExportStartResponse",
    responses: {
      "202": "MediaServerExportStartResponse",
      "409": "ApiError",
    },
    tags: ["media-server-export"],
  },
  "GET /api/settings/media-server-export/jobs/:jobId": {
    summary: "Get media server export job",
    response: "MediaServerExportJob",
    tags: ["media-server-export"],
  },
  "POST /api/settings/media-server-export/jobs/:jobId/cancel": {
    summary: "Cancel media server export job",
    response: "MessageResponse",
    tags: ["media-server-export"],
  },
};

const toOpenApiPath = (path: string): string => path.replace(/:([A-Za-z0-9_]+)/g, "{$1}");

const getPathParameters = (path: string): OpenApiParameter[] => {
  const parameters: OpenApiParameter[] = [];
  const matcher = /:([A-Za-z0-9_]+)/g;
  let match: RegExpExecArray | null;

  while ((match = matcher.exec(path)) !== null) {
    parameters.push({
      in: "path",
      name: match[1],
      required: true,
      schema: { type: "string" },
    });
  }

  return parameters;
};

const toDocumentedApiRoute = (definition: ApiRouteDefinition): DocumentedRoute => ({
  allowApiKey: definition.allowApiKey,
  method: definition.method,
  path: `/api${definition.path}`,
});

const getRouteKey = (route: DocumentedRoute): string => `${route.method.toUpperCase()} ${route.path}`;

const getTag = (path: string): string => {
  const parts = path.split("/").filter(Boolean);

  if (parts[0] === "api" && parts[1]) {
    return parts[1];
  }

  return parts[0] ?? "api";
};

const toTitle = (value: string): string =>
  value
    .replace(/[{}:]/g, "")
    .split(/[-_/\s]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");

const summarizeRoute = (route: DocumentedRoute): string => {
  const pathParts = route.path.split("/").filter(Boolean);
  const meaningfulParts = pathParts[0] === "api" ? pathParts.slice(1) : pathParts;
  const name = meaningfulParts.length > 0 ? toTitle(meaningfulParts.join(" ")) : "API";

  return `${route.method.toUpperCase()} ${name}`;
};

const toOperationId = (route: DocumentedRoute): string => {
  const normalizedPath = route.path
    .split("/")
    .filter(Boolean)
    .filter((part) => part !== "api")
    .map((part) => part.replace(/^:/, "by-"))
    .join("-");

  return `${route.method}-${normalizedPath || "root"}`
    .replace(/[^A-Za-z0-9]+(.)/g, (_match, char: string) => char.toUpperCase())
    .replace(/^[A-Z]/, (char) => char.toLowerCase());
};

const buildCurlSample = (route: DocumentedRoute, spec: RouteSpec): string => {
  const url = toOpenApiPath(route.path);
  const lines = [`curl -X ${route.method.toUpperCase()} "http://localhost:5551${url}"`];

  if (!route.public) {
    lines.push('  -H "Cookie: mytube_auth_session=<session>"');
  }

  if (["delete", "patch", "post", "put"].includes(route.method)) {
    lines.push('  -H "X-CSRF-Token: <csrf-token>"');
  }

  if (spec.requestContentType === "multipart/form-data") {
    lines.push('  -F "file=@/path/to/file"');
  } else if (spec.request && ["patch", "post", "put"].includes(route.method)) {
    lines.push('  -H "Content-Type: application/json"', "  -d '{}'");
  }

  return lines.join(" \\\n");
};

const getRequestBody = (spec?: RouteSpec): OpenApiOperation["requestBody"] | undefined => {
  if (!spec?.request) {
    return undefined;
  }

  const contentType = spec.requestContentType ?? "application/json";
  return {
    required: true,
    content: {
      [contentType]: json(spec.request),
    },
  };
};

const getSecurity = (route: DocumentedRoute): OpenApiOperation["security"] | undefined => {
  if (route.public) {
    if (["delete", "patch", "post", "put"].includes(route.method)) {
      return [{ csrfHeader: [] }];
    }

    return undefined;
  }

  const cookieSecurity: Record<string, string[]> = { cookieAuth: [] };

  if (["delete", "patch", "post", "put"].includes(route.method)) {
    cookieSecurity.csrfHeader = [];
  }

  if (route.allowApiKey) {
    return [cookieSecurity, { apiKeyHeader: [] }, { apiKeyAuthorization: [] }];
  }

  return [cookieSecurity];
};

const buildResponse = (
  description: string,
  schema: string | SchemaObject,
  contentType = "application/json"
): { content: Record<string, unknown>; description: string } => ({
  description,
  content: {
    [contentType]: json(schema),
  },
});

const getResponses = (spec?: RouteSpec): OpenApiOperation["responses"] => {
  const responseSchema = spec?.response ?? "SuccessResponse";
  const responseContentType = spec?.responseContentType ?? "application/json";
  const responses: OpenApiOperation["responses"] = {
    "200": buildResponse("Successful response", responseSchema, responseContentType),
    "400": buildResponse("Bad request", "ApiError"),
    "401": buildResponse("Unauthorized", "ApiError"),
    "403": buildResponse("Forbidden", "ApiError"),
    "404": buildResponse("Not found", "ApiError"),
    "429": buildResponse("Too many requests", "ApiError"),
    "500": buildResponse("Server error", "ApiError"),
  };

  for (const [status, schema] of Object.entries(spec?.responses ?? {})) {
    responses[status] = buildResponse("Response", schema);
  }

  return responses;
};

const createOperation = (route: DocumentedRoute): OpenApiOperation => {
  const spec = routeSpecs[getRouteKey(route)];
  const parameters = [...getPathParameters(route.path), ...(spec?.query ?? [])];
  const security = getSecurity(route);

  return {
    operationId: spec?.operationId ?? toOperationId(route),
    ...(parameters.length > 0 ? { parameters } : {}),
    ...(getRequestBody(spec) ? { requestBody: getRequestBody(spec) } : {}),
    ...(security ? { security } : {}),
    ...(spec?.description ? { description: spec.description } : {}),
    responses: getResponses(spec),
    summary: spec?.summary ?? summarizeRoute(route),
    tags: spec?.tags ?? [getTag(route.path)],
    "x-codeSamples": [
      {
        lang: "curl",
        label: "curl",
        source: buildCurlSample(route, spec ?? {}),
      },
    ],
  };
};

export const buildOpenApiDocument = (): OpenApiDocument => {
  const routes = [
    ...feedRoutes,
    ...staticAndRedirectRoutes,
    ...apiRouteDefinitions.map(toDocumentedApiRoute),
    ...settingsRoutes,
  ];

  const paths = routes.reduce<OpenApiDocument["paths"]>((accumulator, route) => {
    const openApiPath = toOpenApiPath(route.path);
    accumulator[openApiPath] = {
      ...accumulator[openApiPath],
      [route.method]: createOperation(route),
    };

    return accumulator;
  }, {});

  const tagNames = Array.from(
    new Set(
      routes.flatMap((route) => routeSpecs[getRouteKey(route)]?.tags ?? [getTag(route.path)])
    )
  ).sort();

  return {
    openapi: "3.0.3",
    info: {
      title: "MyTube Backend API",
      description:
        "OpenAPI contract for MyTube backend clients. Includes DTO schemas, request bodies, response bodies, auth schemes, and curl samples.",
      version: VERSION.number,
    },
    servers: [{ url: "/" }],
    tags: tagNames.map((name) => ({ name })),
    components: {
      schemas,
      securitySchemes: {
        apiKeyHeader: {
          type: "apiKey",
          in: "header",
          name: "X-API-Key",
        },
        apiKeyAuthorization: {
          type: "apiKey",
          in: "header",
          name: "Authorization",
          description: "Use the format: ApiKey <key>",
        },
        cookieAuth: {
          type: "apiKey",
          in: "cookie",
          name: "mytube_auth_session",
        },
        csrfHeader: {
          type: "apiKey",
          in: "header",
          name: "X-CSRF-Token",
        },
      },
    },
    paths,
  };
};

export const registerSwaggerRoutes = (app: Express): void => {
  const openApiDocument = buildOpenApiDocument();

  app.get("/docs.json", (_req: Request, res: Response) => {
    res.json(openApiDocument);
  });

  app.use(
    "/docs",
    swaggerUi.serve,
    swaggerUi.setup(openApiDocument, {
      customSiteTitle: "MyTube API Docs",
      swaggerOptions: {
        persistAuthorization: true,
      },
    })
  );
};
