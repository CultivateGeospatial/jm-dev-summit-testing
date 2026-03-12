import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ArcgisMap as ArcgisMapElement } from "@arcgis/map-components/components/arcgis-map/customElement";
import type { ArcgisSketch as ArcgisSketchElement } from "@arcgis/map-components/components/arcgis-sketch/customElement";
import {
  ArcgisMap,
  ArcgisZoom,
  ArcgisExpand,
  ArcgisLayerList,
  ArcgisLegend,
  ArcgisSketch,
  ArcgisSearch,
  ArcgisEditor,
  ArcgisFeatureTable,
} from "@arcgis/map-components-react";
import {
  CalciteShell,
  CalciteNavigation,
  CalciteNavigationLogo,
  CalciteShellPanel,
  CalcitePanel,
  CalciteTabs,
  CalciteTabNav,
  CalciteTabTitle,
  CalciteTab,
  CalciteButton,
} from "@esri/calcite-components-react";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import type Polyline from "@arcgis/core/geometry/Polyline";
import esriId from "@arcgis/core/identity/IdentityManager";

import SignInModal from "./components/SignInModal";
import ElevationPanel, { type SelectedRoute } from "./components/ElevationPanel";

const MAP_ELEMENT_ID = "app-map";

const FEATURE_LAYER_URL =
  (import.meta.env.VITE_AIMS_FEATURE_LAYER_URL as string | undefined) ||
  "https://aimsgis.cultivategeospatial.com/server/rest/services/ColumbusRoutes/FeatureServer/0";

const App: React.FC = () => {
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [viewReady, setViewReady] = useState(false);
  const [featureLayer, setFeatureLayer] = useState<FeatureLayer | null>(null);
  const [selectedFeatures, setSelectedFeatures] = useState<SelectedRoute[]>([]);
  const [filterBySelection, setFilterBySelection] = useState(false);
  const [selectionTool, setSelectionTool] = useState<string | null>(null);

  const mapRef = useRef<ArcgisMapElement | null>(null);
  const drawSketchRef = useRef<ArcgisSketchElement | null>(null);
  const drawLayerRef = useRef<GraphicsLayer | null>(null);
  const layerRef = useRef<FeatureLayer | null>(null);
  const sketchVMRef = useRef<SketchViewModel | null>(null);
  const selHandleRef = useRef<{ remove: () => void } | null>(null);
  const clickHandleRef = useRef<{ remove: () => void } | null>(null);
  const viewInitializedRef = useRef(false);

  // ── Map initialization ───────────────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn) return;

    const mapEl = mapRef.current;
    if (!mapEl) return;

    // Set initial center/zoom once via DOM (not React props, to avoid re-renders resetting the view)
    if (!viewInitializedRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapEl as any).center = [-82.998, 39.961];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (mapEl as any).zoom = 10;
    }

    const initView = () => {
      if (!mapEl.view?.ready || viewInitializedRef.current) return;
      viewInitializedRef.current = true;

      const view = mapEl.view;
      if (!view.map) return;

      setViewReady(true);

      const selectionLayer = new GraphicsLayer({ listMode: "hide" });
      const drawLayer = new GraphicsLayer({ listMode: "hide" });
      const layer = new FeatureLayer({ url: FEATURE_LAYER_URL });
      view.map.addMany([selectionLayer, drawLayer, layer]);
      drawLayerRef.current = drawLayer;
      layerRef.current = layer;
      setFeatureLayer(layer);

      // ── SketchViewModel for spatial selection (no UI widget) ──
      const sketchVM = new SketchViewModel({
        view,
        layer: selectionLayer,
      });
      sketchVMRef.current = sketchVM;

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      sketchVM.on("create", async (event: any) => {
        if (event.state !== "complete") return;
        const geom = event.graphic?.geometry;
        if (!geom) return;

        try {
          const result = await layer.queryFeatures({
            geometry: geom,
            spatialRelationship: "intersects",
            returnGeometry: false,
            outFields: [layer.objectIdField],
          });
          const oids = result.features.map(
            (f) => f.attributes[layer.objectIdField] as number
          );
          view.selectionManager.replace(layer, oids);
        } catch (err) {
          console.error("Selection query failed:", err);
        } finally {
          selectionLayer.removeAll();
          setSelectionTool(null);
        }
      });

      // ── Click-to-select via standard view API ──
      layer.when(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        clickHandleRef.current = view.on("click", async (event: any) => {
          // Skip click-to-select while a sketching tool is active
          if (sketchVM.state === "active") return;
          // Skip clicks on UI widgets (buttons, expand panels, etc.)
          const target = event.native?.target as HTMLElement | undefined;
          if (target?.closest?.(".esri-ui, .selection-toolbar, calcite-button, arcgis-expand")) return;
          const response = await view.hitTest(event, { include: [layer] });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const hit = response.results.find((r: any) => r.type === "graphic" && r.layer === layer) as any;
          if (hit) {
            const oid = hit.graphic.attributes[layer.objectIdField];
            view.selectionManager.replace(layer, [oid]);
          } else {
            view.selectionManager.replace(layer, []);
          }
        });
      });

      // ── Subscribe to selection changes ──
      selHandleRef.current?.remove();
      selHandleRef.current = view.selectionManager.on(
        "selection-change",
        async () => {
          const sel = view.selectionManager.getSelection(layer) as number[] | undefined;
          if (!sel || sel.length === 0) {
            setSelectedFeatures((prev) => prev.length === 0 ? prev : []);
            setFilterBySelection((prev) => prev ? false : prev);
            return;
          }

          setFilterBySelection((prev) => prev ? false : prev);

          try {
            const result = await layer.queryFeatures({
              objectIds: sel,
              returnGeometry: true,
              outSpatialReference: view.spatialReference,
              outFields: ["*"],
            });
            const routes: SelectedRoute[] = result.features
              .filter((f) => f.geometry)
              .map((f) => ({
                oid: f.attributes[layer.objectIdField] as number,
                geometry: f.geometry as Polyline,
                label: f.attributes.RouteName ?? f.attributes.Name ?? `Route ${f.attributes[layer.objectIdField]}`,
              }));
            setSelectedFeatures(routes);
            if (result.features.length > 0) {
              const extent = result.features[0].geometry
                ? await layer.queryExtent({ objectIds: sel })
                : null;
              if (extent?.extent) {
                view.goTo({ target: extent.extent.expand(1.2) }, { animate: true, duration: 800 });
              }
            }
          } catch {
            setSelectedFeatures([]);
          }
        }
      );
    };

    mapEl.addEventListener("arcgisViewReadyChange", initView);
    initView();

    return () => {
      mapEl.removeEventListener("arcgisViewReadyChange", initView);
      selHandleRef.current?.remove();
      clickHandleRef.current?.remove();
      sketchVMRef.current?.destroy();
      const map = mapEl.view?.map;
      if (map && layerRef.current) {
        map.remove(layerRef.current);
      }
      viewInitializedRef.current = false;
    };
  }, [isSignedIn]);

  // ── Assign hidden layer to draw sketch after it mounts ──────────────
  useEffect(() => {
    if (!viewReady) return;
    const map = mapRef.current?.view?.map;
    if (!map) return;

    const timer = setTimeout(() => {
      if (drawSketchRef.current && drawLayerRef.current) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const defaultDrawLayer = (drawSketchRef.current as any).layer;
        if (defaultDrawLayer && defaultDrawLayer !== drawLayerRef.current) {
          map.remove(defaultDrawLayer);
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (drawSketchRef.current as any).layer = drawLayerRef.current;
      }
    }, 100);

    return () => clearTimeout(timer);
  }, [viewReady]);

  // ── Start spatial selection tool ────────────────────────────────────
  const startSelection = useCallback((tool: "rectangle" | "circle" | "polygon") => {
    const sketchVM = sketchVMRef.current;
    if (!sketchVM) return;
    sketchVM.cancel();
    sketchVM.create(tool);
    setSelectionTool(tool);
  }, []);

  const cancelSelection = useCallback(() => {
    sketchVMRef.current?.cancel();
    setSelectionTool(null);
  }, []);

  // ── Filter feature table by selection ────────────────────────────────
  const handleFilterBySelection = useCallback(async () => {
    const next = !filterBySelection;
    setFilterBySelection(next);

    if (next) {
      const view = mapRef.current?.view;
      const layer = layerRef.current;
      if (!view || !layer) return;

      const sel = view.selectionManager.getSelection(layer) as number[] | undefined;
      if (!sel || sel.length === 0) return;

      try {
        const result = await layer.queryExtent({ objectIds: sel });
        if (result.extent) {
          view.goTo({ target: result.extent.expand(1.2) }, { animate: true, duration: 800 });
        }
      } catch { /* non-fatal */ }
    }
  }, [filterBySelection]);

  // ── Sign out ─────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    esriId.destroyCredentials();
    window.location.reload();
  }, []);

  // ── Sign-in gate ─────────────────────────────────────────────────────
  if (!isSignedIn) {
    return (
      <SignInModal
        serverUrl={FEATURE_LAYER_URL}
        onSignIn={() => setIsSignedIn(true)}
      />
    );
  }

  // ── Main layout using Calcite Shell with slots ───────────────────────
  return (
    <CalciteShell>
      {/* ═══ Header (slot="header") ═══ */}
      <CalciteNavigation slot="header">
        <CalciteNavigationLogo
          slot="logo"
          heading="JM Dev Summit Testing"
        />
        <div slot="user" className="header-actions">
          <CalciteButton
            appearance="transparent"
            iconStart="sign-out"
            scale="s"
            onClick={handleSignOut}
          >
            Sign Out
          </CalciteButton>
        </div>
      </CalciteNavigation>

      {/* ═══ Bottom panel (slot="panel-bottom") ═══ */}
      <CalciteShellPanel slot="panel-bottom" displayMode="float">
        <CalcitePanel>
          <CalciteTabs>
            <CalciteTabNav slot="title-group">
              <CalciteTabTitle selected>Feature Table</CalciteTabTitle>
              <CalciteTabTitle>Elevation Profile</CalciteTabTitle>
            </CalciteTabNav>

            <CalciteTab>
              <div className="table-toolbar">
                <CalciteButton
                  appearance={filterBySelection ? "solid" : "outline"}
                  scale="s"
                  onClick={handleFilterBySelection}
                >
                  {filterBySelection ? "All Records" : "Selected Only"}
                </CalciteButton>
              </div>
              {featureLayer && (
                <ArcgisFeatureTable
                  referenceElement={MAP_ELEMENT_ID}
                  layer={featureLayer}
                  syncViewSelection={true}
                  filterBySelectionEnabled={filterBySelection}
                  autoDestroyDisabled={true}
                  style={{ height: "250px", display: "block" }}
                />
              )}
            </CalciteTab>

            <CalciteTab>
              {featureLayer ? (
                <ElevationPanel routes={selectedFeatures} mapElementId={MAP_ELEMENT_ID} />
              ) : (
                <div className="elevation-status">Waiting for map to load…</div>
              )}
            </CalciteTab>
          </CalciteTabs>
        </CalcitePanel>
      </CalciteShellPanel>

      {/* ═══ Center content: Map with all widgets as slotted children ═══ */}
      <ArcgisMap
        id={MAP_ELEMENT_ID}
        ref={mapRef}
        basemap="topo-vector"
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ground={"world-elevation" as any}
      >
        {viewReady && (
          <>
            {/* ── top-left slots ── */}
            <ArcgisZoom slot="top-left" />
            <ArcgisExpand slot="top-left" expandTooltip="Layers">
              <ArcgisLayerList />
            </ArcgisExpand>
            <ArcgisExpand slot="top-left" expandTooltip="Legend">
              <ArcgisLegend />
            </ArcgisExpand>

            {/* ── top-right slots ── */}
            <ArcgisExpand slot="top-right" expandTooltip="Select Features" expandIcon="cursor-marquee" group="top-right">
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div className="selection-toolbar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <CalciteButton
                  iconStart="rectangle"
                  appearance={selectionTool === "rectangle" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("rectangle")}
                >
                  Rectangle
                </CalciteButton>
                <CalciteButton
                  iconStart="circle"
                  appearance={selectionTool === "circle" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("circle")}
                >
                  Circle
                </CalciteButton>
                <CalciteButton
                  iconStart="freehand-area"
                  appearance={selectionTool === "polygon" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("polygon")}
                >
                  Lasso
                </CalciteButton>
                {selectionTool && (
                  <CalciteButton
                    iconStart="x"
                    appearance="outline"
                    scale="s"
                    kind="danger"
                    onClick={cancelSelection}
                  >
                    Cancel
                  </CalciteButton>
                )}
              </div>
            </ArcgisExpand>
            <ArcgisExpand slot="top-right" expandTooltip="Sketch" expandIcon="pencil" group="top-right">
              <ArcgisSketch ref={drawSketchRef} />
            </ArcgisExpand>
            <ArcgisExpand slot="top-right" expandTooltip="Search" expandIcon="search" group="top-right">
              <ArcgisSearch />
            </ArcgisExpand>
            <ArcgisExpand slot="top-right" expandTooltip="Edit" expandIcon="pencil-square" group="top-right">
              <ArcgisEditor />
            </ArcgisExpand>
          </>
        )}
      </ArcgisMap>
    </CalciteShell>
  );
};

export default App;
