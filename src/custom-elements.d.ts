/**
 * JSX IntrinsicElements for ArcGIS Map Components and Calcite Design System.
 * React 19 passes unknown props as properties to custom elements natively.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */
declare namespace React.JSX {
  interface WebComponentBase extends React.HTMLAttributes<HTMLElement> {
    slot?: string;
    class?: string;
    ref?: any;
    key?: React.Key;
  }

  interface IntrinsicElements {
    // ── ArcGIS Map Components ──
    "arcgis-map": WebComponentBase & {
      basemap?: string;
      ground?: string;
      center?: any;
      zoom?: number;
      itemId?: string;
    };
    "arcgis-zoom": WebComponentBase;
    "arcgis-expand": WebComponentBase & {
      expandTooltip?: string;
      expandIcon?: string;
      group?: string;
    };
    "arcgis-layer-list": WebComponentBase;
    "arcgis-legend": WebComponentBase;
    "arcgis-sketch": WebComponentBase;
    "arcgis-search": WebComponentBase;
    "arcgis-editor": WebComponentBase;
    "arcgis-feature-table": WebComponentBase & {
      referenceElement?: string;
      layer?: any;
      syncViewSelection?: boolean;
      filterBySelectionEnabled?: boolean;
      autoDestroyDisabled?: boolean;
    };
    "arcgis-elevation-profile": WebComponentBase & {
      referenceElement?: string;
      geometry?: any;
    };
    "arcgis-bookmarks": WebComponentBase & {
      bookmarks?: any;
    };

    // ── Calcite Design System ──
    "calcite-shell": WebComponentBase;
    "calcite-shell-panel": WebComponentBase & { displayMode?: string };
    "calcite-panel": WebComponentBase;
    "calcite-navigation": WebComponentBase;
    "calcite-navigation-logo": WebComponentBase & { heading?: string };
    "calcite-tabs": WebComponentBase;
    "calcite-tab-nav": WebComponentBase;
    "calcite-tab-title": WebComponentBase & { selected?: boolean };
    "calcite-tab": WebComponentBase;
    "calcite-button": WebComponentBase & {
      appearance?: string;
      iconStart?: string;
      scale?: string;
      kind?: string;
    };
    "calcite-select": WebComponentBase & {
      label?: string;
      scale?: string;
      onCalciteSelectChange?: (e: any) => void;
    };
    "calcite-option": WebComponentBase & {
      value?: string;
      selected?: boolean;
    };
  }
}
