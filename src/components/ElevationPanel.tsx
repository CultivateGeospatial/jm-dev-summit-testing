import React, { useRef, useEffect, useState } from "react";
import type { ArcgisElevationProfile as ArcgisElevationProfileElement } from "@arcgis/map-components/components/arcgis-elevation-profile/customElement";
import { ArcgisElevationProfile } from "@arcgis/map-components-react";
import { CalciteSelect, CalciteOption } from "@esri/calcite-components-react";
import type Polyline from "@arcgis/core/geometry/Polyline";

export interface SelectedRoute {
  oid: number;
  geometry: Polyline;
  label: string;
}

interface ElevationPanelProps {
  routes: SelectedRoute[];
  mapElementId: string;
}

const ElevationPanel: React.FC<ElevationPanelProps> = ({ routes, mapElementId }) => {
  const elevRef = useRef<ArcgisElevationProfileElement | null>(null);
  const [activeOid, setActiveOid] = useState<number | null>(null);

  // Pick the active route (fall back to first if activeOid no longer in list)
  const activeRoute = routes.find((r) => r.oid === activeOid) ?? routes[0] ?? null;

  // Reset activeOid when routes change and current selection is gone
  useEffect(() => {
    if (routes.length === 0) {
      setActiveOid(null);
    } else if (!routes.some((r) => r.oid === activeOid)) {
      setActiveOid(routes[0].oid);
    }
  }, [routes, activeOid]);

  // Push geometry to the elevation profile widget
  useEffect(() => {
    if (elevRef.current) {
      elevRef.current.geometry = activeRoute?.geometry ?? null;
    }
  }, [activeRoute]);

  return (
    <div className="tab-content elevation-content">
      {routes.length === 0 && (
        <div className="elevation-status">
          Select a route on the map to view its elevation profile
        </div>
      )}
      {routes.length > 1 && (
        <div className="elevation-route-picker">
          <CalciteSelect
            label="Choose route"
            scale="s"
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            onCalciteSelectChange={(e: any) => {
              const val = e.target?.value;
              if (val) setActiveOid(Number(val));
            }}
          >
            {routes.map((r) => (
              <CalciteOption
                key={r.oid}
                value={String(r.oid)}
                selected={r.oid === activeRoute?.oid ? true : undefined}
              >
                {r.label}
              </CalciteOption>
            ))}
          </CalciteSelect>
        </div>
      )}
      <ArcgisElevationProfile
        ref={elevRef}
        referenceElement={mapElementId}
        className="bottom-widget"
      />
    </div>
  );
};

export default ElevationPanel;
