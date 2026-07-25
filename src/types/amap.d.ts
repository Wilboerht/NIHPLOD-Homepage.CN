/**
 * 高德地图 AMap SDK 类型声明
 * 提供 AMap.Autocomplete / PlaceSearch / Geocoder / Map / Marker 等核心类型的 TypeScript 支持
 */

interface _AMapSecurityConfig {
  securityJsCode?: string;
}

interface Window {
  AMap: typeof AMap;
  _AMapSecurityConfig: _AMapSecurityConfig;
}

declare namespace AMap {
  /** 经纬度坐标 */
  interface LngLat {
    lng: number;
    lat: number;
  }

  /** 搜索提示条目 */
  interface Tip {
    name: string;
    district: string;
    adcode?: string;
    location: LngLat;
    address?: string;
  }

  /** Autocomplete 搜索结果 */
  interface AutocompleteResult {
    tips: Tip[];
  }

  /** Autocomplete 构造函数选项 */
  interface AutocompleteOptions {
    city?: string;
    citylimit?: boolean;
    input?: string;
    type?: string;
  }

  /** 自动补全类 */
  class Autocomplete {
    constructor(opts: AutocompleteOptions);
    search(
      keyword: string,
      callback: (status: string, result: AutocompleteResult) => void
    ): void;
  }

  // ── PlaceSearch（地点搜索）──

  /** 地点 POI 条目 */
  interface Poi {
    location: LngLat;
    name?: string;
    address?: string;
    pname?: string;
    cityname?: string;
    adname?: string;
  }

  /** PlaceSearch 搜索结果 */
  interface PlaceSearchResult {
    poiList: {
      pois: Poi[];
    };
  }

  /** PlaceSearch 选项 */
  interface PlaceSearchOptions {
    city?: string;
    pageSize?: number;
    pageIndex?: number;
  }

  /** 地点搜索类 */
  class PlaceSearch {
    constructor(opts?: PlaceSearchOptions);
    search(
      keyword: string,
      callback: (status: string, result: PlaceSearchResult) => void
    ): void;
  }

  // ── Geocoder（地理编码）──

  /** 地理编码结果项 */
  interface Geocode {
    location: LngLat;
    formattedAddress?: string;
    addressComponent?: Record<string, unknown>;
  }

  /** Geocoder 搜索结果 */
  interface GeocoderResult {
    geocodes: Geocode[];
  }

  /** Geocoder 选项 */
  interface GeocoderOptions {
    city?: string;
  }

  /** 地理编码类 */
  class Geocoder {
    constructor(opts?: GeocoderOptions);
    getLocation(
      address: string,
      callback: (status: string, result: GeocoderResult) => void
    ): void;
  }

  // ── Map（地图）──

  /** 地图选项 */
  interface MapOptions {
    zoom?: number;
    center?: [number, number];
    viewMode?: string;
  }

  /** 地图类 */
  class Map {
    constructor(container: string | HTMLElement, opts?: MapOptions);
    add(overlay: unknown): void;
  }

  // ── Marker（标记点）──

  /** 标记点标签 */
  interface MarkerLabel {
    content: string;
    direction?: string;
    offset?: Pixel;
  }

  /** 标记点选项 */
  interface MarkerOptions {
    position: [number, number];
    title?: string;
    label?: MarkerLabel;
  }

  /** 标记点类 */
  class Marker {
    constructor(opts: MarkerOptions);
  }

  // ── Pixel（像素偏移）──

  /** 像素偏移 */
  class Pixel {
    constructor(x: number, y: number);
  }

  /** 加载插件 */
  function plugin(plugins: string[], callback: () => void): void;
}
