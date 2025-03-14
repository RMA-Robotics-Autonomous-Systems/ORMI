import React from 'react';
import { useLocalDataSource } from "@/core/datasources/components/local-datasource-provider";
import { PointsCloud, Color } from "@/core/types/common";
import { PointsCloudProps } from '../types/points-cloud-types';
import PointsCloudWebGL from './points-cloud-webgl';

export default function PointsCloudCompWebGL(props: PointsCloudProps) {
    const maxPoints = props.maxPoints ?? 100;
    const { sources } = useLocalDataSource();
    const sources_keys = Array.from(sources.keys());
    const value = sources_keys.length > 0 ? sources.get(sources_keys[sources_keys.length - 1]) : { data: [] };
    const last_value: PointsCloud & { colors?: Color[] } = (value?.data?.[0] as PointsCloud) || { points: [] };

    const rawPoints = (last_value.points && last_value.points.length)
        ? last_value.points
        : [];
    const pointsArray = rawPoints.slice(0, maxPoints);
    const pointsColors = last_value.colors && last_value.colors.length >= pointsArray.length
        ? last_value.colors.slice(0, pointsArray.length)
        : undefined;

    return (
        <div style={{ width: '100%', height: '100%' }}>
            <PointsCloudWebGL points={pointsArray} colors={pointsColors} />
        </div>
    );
}
