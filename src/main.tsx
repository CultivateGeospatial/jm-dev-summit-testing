import "@arcgis/core/assets/esri/themes/light/main.css";
import "@esri/calcite-components/main.css";
import "./styles/App.css";

// Register Calcite custom elements
import "@esri/calcite-components/components/calcite-shell/customElement";
import "@esri/calcite-components/components/calcite-shell-panel/customElement";
import "@esri/calcite-components/components/calcite-panel/customElement";
import "@esri/calcite-components/components/calcite-navigation/customElement";
import "@esri/calcite-components/components/calcite-navigation-logo/customElement";
import "@esri/calcite-components/components/calcite-button/customElement";
import "@esri/calcite-components/components/calcite-tab-nav/customElement";
import "@esri/calcite-components/components/calcite-tab-title/customElement";
import "@esri/calcite-components/components/calcite-tabs/customElement";
import "@esri/calcite-components/components/calcite-tab/customElement";
import "@esri/calcite-components/components/calcite-select/customElement";
import "@esri/calcite-components/components/calcite-option/customElement";

// Register ArcGIS Map custom elements
import "@arcgis/map-components/components/arcgis-map/customElement";
import "@arcgis/map-components/components/arcgis-zoom/customElement";
import "@arcgis/map-components/components/arcgis-expand/customElement";
import "@arcgis/map-components/components/arcgis-layer-list/customElement";
import "@arcgis/map-components/components/arcgis-legend/customElement";
import "@arcgis/map-components/components/arcgis-sketch/customElement";
import "@arcgis/map-components/components/arcgis-search/customElement";
import "@arcgis/map-components/components/arcgis-editor/customElement";
import "@arcgis/map-components/components/arcgis-feature-table/customElement";
import "@arcgis/map-components/components/arcgis-elevation-profile/customElement";

import ReactDOM from "react-dom/client";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(<App />);
