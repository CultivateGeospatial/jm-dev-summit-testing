import React, { useState, useCallback, useRef, useEffect } from "react";
import type { ArcgisMap as ArcgisMapElement } from "@arcgis/map-components/components/arcgis-map/customElement";
import type { ArcgisSketch as ArcgisSketchElement } from "@arcgis/map-components/components/arcgis-sketch/customElement";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";
import SketchViewModel from "@arcgis/core/widgets/Sketch/SketchViewModel";
import Graphic from "@arcgis/core/Graphic";
import SimpleMarkerSymbol from "@arcgis/core/symbols/SimpleMarkerSymbol";
import SimpleLineSymbol from "@arcgis/core/symbols/SimpleLineSymbol";
import SimpleFillSymbol from "@arcgis/core/symbols/SimpleFillSymbol";
import Bookmark from "@arcgis/core/webmap/Bookmark";
import Collection from "@arcgis/core/core/Collection";
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
  const [skippedAuth, setSkippedAuth] = useState(false);
  const [viewReady, setViewReady] = useState(false);
  const [featureLayer, setFeatureLayer] = useState<FeatureLayer | null>(null);
  const [allFeatureLayers, setAllFeatureLayers] = useState<FeatureLayer[]>([]);
  const [selectedFeatures, setSelectedFeatures] = useState<SelectedRoute[]>([]);
  const [filterBySelection, setFilterBySelection] = useState(false);
  const [selectionTool, setSelectionTool] = useState<string | null>(null);

  const mapRef = useRef<ArcgisMapElement | null>(null);
  const drawSketchRef = useRef<ArcgisSketchElement | null>(null);
  const drawLayerRef = useRef<GraphicsLayer | null>(null);
  const layerRef = useRef<FeatureLayer | null>(null);
  const featureTableRef = useRef<HTMLElement | null>(null);
  const sketchVMRef = useRef<SketchViewModel | null>(null);
  const selHandleRef = useRef<{ remove: () => void } | null>(null);
  const clickHandleRef = useRef<{ remove: () => void } | null>(null);
  const bookmarksRef = useRef<HTMLElement | null>(null);
  const layerPickerRef = useRef<HTMLElement | null>(null);
  const viewInitializedRef = useRef(false);

  // ── Map initialization ───────────────────────────────────────────────
  useEffect(() => {
    if (!isSignedIn && !skippedAuth) return;

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

      // Auto-generate popup templates for layers that don't define one
      if (view.popup) view.popup.defaultPopupTemplateEnabled = true;

      setViewReady(true);

      const selectionLayer = new GraphicsLayer({ listMode: "hide" });
      const drawLayer = new GraphicsLayer({ listMode: "hide" });

      // Public sample layers (no auth needed)
      const wildfirePoints = new FeatureLayer({
        url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Wildfire/FeatureServer/0",
        title: "Wildfire Points",
      });
      const wildfireLines = new FeatureLayer({
        url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Wildfire/FeatureServer/1",
        title: "Wildfire Lines",
      });
      const wildfirePolygons = new FeatureLayer({
        url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/Wildfire/FeatureServer/2",
        title: "Wildfire Polygons",
      });
      const sf311 = new FeatureLayer({
        url: "https://sampleserver6.arcgisonline.com/arcgis/rest/services/SF311/FeatureServer/0",
        title: "SF 311 Incidents",
      });
      const trails = new FeatureLayer({
        url: "https://services3.arcgis.com/GVgbJbqm8hXASVYi/arcgis/rest/services/Trails/FeatureServer/0",
        title: "Trails (Elevation Demo)",
      });

      const allLayers: (FeatureLayer | GraphicsLayer)[] = [selectionLayer, drawLayer, wildfirePoints, wildfireLines, wildfirePolygons, sf311, trails];

      // AIMS layer only when signed in with credentials
      let layer: FeatureLayer;
      if (isSignedIn) {
        layer = new FeatureLayer({ url: FEATURE_LAYER_URL, title: "Columbus LRS" });
        allLayers.push(layer);
      } else {
        // Use SF311 as the active layer for table/selection in demo mode
        layer = sf311;
      }

      const featureLayers = [wildfirePoints, wildfireLines, wildfirePolygons, sf311, trails, ...(isSignedIn ? [layer] : [])];

      view.map.addMany(allLayers);
      drawLayerRef.current = drawLayer;
      layerRef.current = layer;
      setFeatureLayer(layer);
      setAllFeatureLayers(featureLayers);

      // Register all feature layers as selection sources so selectionManager.replace() works
      featureLayers.forEach((fl) => {
        fl.when(() => {
          view.selectionManager.sources.add(fl);
        });
      });

      // ── Create bookmarks from layer extents ──
      const bookmarkLayers = [wildfirePoints, wildfireLines, wildfirePolygons, sf311, trails, ...(isSignedIn ? [layer] : [])];
      Promise.all(
        bookmarkLayers.map((l) =>
          l.when().then(() => l.queryExtent()).then((result) => ({
            name: l.title ?? "Untitled",
            extent: result.extent,
          }))
          .catch(() => null)
        )
      ).then((results) => {
        const bookmarks = new Collection<Bookmark>();
        for (const r of results) {
          if (r?.extent) {
            bookmarks.add(new Bookmark({ name: r.name, viewpoint: { targetGeometry: r.extent.expand(1.2) } }));
          }
        }
        if (bookmarksRef.current) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (bookmarksRef.current as any).bookmarks = bookmarks;
        }
      });

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
        const activeLayer = layerRef.current;
        if (!activeLayer) return;

        try {
          const result = await activeLayer.queryFeatures({
            geometry: geom,
            spatialRelationship: "intersects",
            returnGeometry: false,
            outFields: [activeLayer.objectIdField],
          });
          const oids = result.features.map(
            (f) => f.attributes[activeLayer.objectIdField] as number
          );
          view.selectionManager.replace(activeLayer, oids);
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

          // Hit-test ALL feature layers for popup
          const response = await view.hitTest(event, { include: featureLayers });
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const allHits = response.results.filter((r: any) => r.type === "graphic") as any[];

          if (allHits.length > 0) {
            // Open popup with all hit features
            view.openPopup({
              features: allHits.map((h: any) => h.graphic),
              location: event.mapPoint,
            });

            // Selection only applies to the active table layer
            const activeLayer = layerRef.current;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const activeHit = allHits.find((h: any) => h.layer === activeLayer);
            if (activeHit) {
              const oid = activeHit.graphic.attributes[activeLayer!.objectIdField];
              view.selectionManager.replace(activeLayer!, [oid]);
            }
          } else {
            const activeLayer = layerRef.current;
            if (activeLayer) view.selectionManager.replace(activeLayer, []);
            view.closePopup();
          }
        });
      });

      // ── Subscribe to selection changes ──
      selHandleRef.current?.remove();
      selHandleRef.current = view.selectionManager.on(
        "selection-change",
        async () => {
          const activeLayer = layerRef.current;
          if (!activeLayer) return;
          const sel = view.selectionManager.getSelection(activeLayer) as number[] | undefined;
          if (!sel || sel.length === 0) {
            setSelectedFeatures((prev) => prev.length === 0 ? prev : []);
            setFilterBySelection((prev) => prev ? false : prev);
            return;
          }

          setFilterBySelection((prev) => prev ? false : prev);

          try {
            const result = await activeLayer.queryFeatures({
              objectIds: sel,
              returnGeometry: true,
              outSpatialReference: view.spatialReference,
              outFields: ["*"],
            });
            const routes: SelectedRoute[] = result.features
              .filter((f) => f.geometry)
              .map((f) => ({
                oid: f.attributes[activeLayer.objectIdField] as number,
                geometry: f.geometry as Polyline,
                label: f.attributes.RouteName ?? f.attributes.TRL_NAME ?? f.attributes.Name ?? f.attributes.description ?? `Route ${f.attributes[activeLayer.objectIdField]}`,
              }));
            setSelectedFeatures(routes);
            if (result.features.length > 0) {
              const extent = result.features[0].geometry
                ? await activeLayer.queryExtent({ objectIds: sel })
                : null;
              if (extent?.extent) {
                view.goTo({ target: extent.extent.expand(1.2) }, { animate: true, duration: 800 });
              }

              // Flash selected features with a cyan highlight that fades after 1.5s
              const flashSymbols: Record<string, SimpleMarkerSymbol | SimpleLineSymbol | SimpleFillSymbol> = {
                point: new SimpleMarkerSymbol({ color: [0, 255, 255, 0.8], size: 14, outline: { color: [0, 200, 255], width: 2 } }),
                polyline: new SimpleLineSymbol({ color: [0, 255, 255, 0.9], width: 5 }),
                polygon: new SimpleFillSymbol({ color: [0, 255, 255, 0.3], outline: { color: [0, 255, 255], width: 3 } }),
              };
              const flashGraphics = result.features
                .filter((f) => f.geometry)
                .map((f) => new Graphic({ geometry: f.geometry!, symbol: flashSymbols[f.geometry!.type] }));
              view.graphics.addMany(flashGraphics);
              setTimeout(() => view.graphics.removeMany(flashGraphics), 1500);
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
  }, [isSignedIn, skippedAuth]);

  // ── Push layer property to feature table via ref (React 19 may not set complex objects) ──
  useEffect(() => {
    if (featureTableRef.current && featureLayer) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (featureTableRef.current as any).layer = featureLayer;
    }
  }, [featureLayer, filterBySelection]);

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

  // ── Layer picker for feature table ──────────────────────────────────
  useEffect(() => {
    const el = layerPickerRef.current;
    if (!el) return;
    const handler = (e: Event) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const val = (e.target as any)?.value;
      if (val == null) return;
      const idx = Number(val);
      const picked = allFeatureLayers[idx];
      if (picked) {
        layerRef.current = picked;
        setFeatureLayer(picked);
        setSelectedFeatures([]);
        setFilterBySelection(false);

        // Zoom to the selected layer's extent
        const view = mapRef.current?.view;
        if (view) {
          picked.when(() => picked.queryExtent()).then((result) => {
            if (result.extent) {
              view.goTo({ target: result.extent.expand(1.2) }, { animate: true, duration: 800 });
            }
          }).catch(() => { /* non-fatal */ });
        }
      }
    };
    el.addEventListener("calciteSelectChange", handler);
    return () => el.removeEventListener("calciteSelectChange", handler);
  }, [allFeatureLayers]);

  // ── Sign out ─────────────────────────────────────────────────────────
  const handleSignOut = useCallback(() => {
    esriId.destroyCredentials();
    window.location.reload();
  }, []);

  // ── Sign-in gate ─────────────────────────────────────────────────────
  if (!isSignedIn && !skippedAuth) {
    return (
      <SignInModal
        serverUrl={FEATURE_LAYER_URL}
        onSignIn={() => setIsSignedIn(true)}
        onSkip={() => setSkippedAuth(true)}
      />
    );
  }

  // ── Main layout using Calcite Shell with slots ───────────────────────
  return (
    <calcite-shell>
      {/* ═══ Header (slot="header") ═══ */}
      <calcite-navigation slot="header">
        <calcite-navigation-logo
          slot="logo"
          heading="JM Dev Summit Testing"
        />
        <div slot="user" className="header-actions">
          <calcite-button
            appearance="transparent"
            iconStart="sign-out"
            scale="s"
            onClick={handleSignOut}
          >
            Sign Out
          </calcite-button>
        </div>
      </calcite-navigation>

      {/* ═══ Bottom panel (slot="panel-bottom") ═══ */}
      <calcite-shell-panel slot="panel-bottom" displayMode="float">
        <calcite-panel>
          <calcite-tabs>
            <calcite-tab-nav slot="title-group">
              <calcite-tab-title selected>Feature Table</calcite-tab-title>
              <calcite-tab-title>Elevation Profile</calcite-tab-title>
            </calcite-tab-nav>

            <calcite-tab>
              <div className="table-toolbar">
                <calcite-select ref={layerPickerRef} label="Layer" scale="s">
                  {allFeatureLayers.map((l, i) => (
                    <calcite-option
                      key={i}
                      value={String(i)}
                      selected={l === featureLayer ? true : undefined}
                    >
                      {l.title ?? `Layer ${i}`}
                    </calcite-option>
                  ))}
                </calcite-select>
                <calcite-button
                  appearance={filterBySelection ? "solid" : "outline"}
                  scale="s"
                  onClick={handleFilterBySelection}
                >
                  {filterBySelection ? "All Records" : "Selected Only"}
                </calcite-button>
              </div>
              {featureLayer && (
                <arcgis-feature-table
                  ref={featureTableRef}
                  referenceElement={MAP_ELEMENT_ID}
                  syncViewSelection={true}
                  filterBySelectionEnabled={filterBySelection}
                  autoDestroyDisabled={true}
                  style={{ height: "250px", display: "block" }}
                />
              )}
            </calcite-tab>

            <calcite-tab>
              {featureLayer ? (
                <ElevationPanel routes={selectedFeatures} mapElementId={MAP_ELEMENT_ID} />
              ) : (
                <div className="elevation-status">Waiting for map to load…</div>
              )}
            </calcite-tab>
          </calcite-tabs>
        </calcite-panel>
      </calcite-shell-panel>

      {/* ═══ Center content: Map with all widgets as slotted children ═══ */}
      <arcgis-map
        id={MAP_ELEMENT_ID}
        ref={mapRef}
        basemap="topo-vector"
        ground="world-elevation"
      >
        {viewReady && (
          <>
            {/* ── top-left slots ── */}
            <arcgis-zoom slot="top-left" />
            <arcgis-expand slot="top-left" expandTooltip="Layers">
              <arcgis-layer-list />
            </arcgis-expand>
            <arcgis-expand slot="top-left" expandTooltip="Legend">
              <arcgis-legend />
            </arcgis-expand>
            <arcgis-expand slot="top-left" expandTooltip="Bookmarks" expandIcon="bookmark">
              <arcgis-bookmarks ref={bookmarksRef} />
            </arcgis-expand>

            {/* ── top-right slots ── */}
            <arcgis-expand slot="top-right" expandTooltip="Select Features" expandIcon="cursor-marquee" group="top-right">
              {/* eslint-disable-next-line jsx-a11y/no-static-element-interactions, jsx-a11y/click-events-have-key-events */}
              <div className="selection-toolbar" onClick={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
                <calcite-button
                  iconStart="rectangle"
                  appearance={selectionTool === "rectangle" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("rectangle")}
                >
                  Rectangle
                </calcite-button>
                <calcite-button
                  iconStart="circle"
                  appearance={selectionTool === "circle" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("circle")}
                >
                  Circle
                </calcite-button>
                <calcite-button
                  iconStart="freehand-area"
                  appearance={selectionTool === "polygon" ? "solid" : "outline"}
                  scale="s"
                  onClick={() => startSelection("polygon")}
                >
                  Lasso
                </calcite-button>
                {selectionTool && (
                  <calcite-button
                    iconStart="x"
                    appearance="outline"
                    scale="s"
                    kind="danger"
                    onClick={cancelSelection}
                  >
                    Cancel
                  </calcite-button>
                )}
              </div>
            </arcgis-expand>
            <arcgis-expand slot="top-right" expandTooltip="Sketch" expandIcon="pencil" group="top-right">
              <arcgis-sketch ref={drawSketchRef} />
            </arcgis-expand>
            <arcgis-expand slot="top-right" expandTooltip="Search" expandIcon="search" group="top-right">
              <arcgis-search />
            </arcgis-expand>
            <arcgis-expand slot="top-right" expandTooltip="Edit" expandIcon="pencil-square" group="top-right">
              <arcgis-editor />
            </arcgis-expand>
          </>
        )}
      </arcgis-map>
    </calcite-shell>
  );
};

export default App;
