/**
 * Core public surface — pure modules only.
 * Views import from here or deeper paths; keep this as a map of domains.
 */

export * as store from './store/index.js';
export * as script from './script/paginate.js';
export * as format from './script/format.js';
export * as wrap from './script/wrap.js';
export * as geom from './geom/camera.js';
export * as pack from './geom/pack.js';
export * as timelineModel from './timeline/model.js';
export * as timelineCal from './timeline/calendar.js';
export * as boardModel from './board/model.js';
export * as boardTemplates from './board/templates.js';
export * as boardTable from './board/table.js';
export * as projectDoc from './project/document.js';
export * as projectSearch from './project/search.js';
export * as formatV2 from './project/format-v2.js';
export * as autosave from './persist/autosave.js';
