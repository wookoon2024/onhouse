import { supabase } from '../lib/supabase';
import { type MapDefinition, maps } from '../game/MapData';

export const getSavedHouseCode = (): string => {
  return localStorage.getItem('on_house_current_code') || 'H-1001';
};

export const setSavedHouseCode = (code: string) => {
  const formatted = code.trim().toUpperCase() || 'H-1001';
  localStorage.setItem('on_house_current_code', formatted);
  return formatted;
};

// Fetch or initialize all maps for a given house code
export const fetchHouseMaps = async (houseCode: string): Promise<Record<string, MapDefinition>> => {
  try {
    const { data, error } = await supabase
      .from('house_maps')
      .select('map_id, map_data')
      .eq('house_code', houseCode);

    if (error) {
      console.warn('Supabase fetchHouseMaps warning:', error.message);
    }

    const loadedMaps: Record<string, MapDefinition> = { ...maps };

    if (data && data.length > 0) {
      data.forEach((row: { map_id: string; map_data: MapDefinition }) => {
        if (row.map_data) {
          loadedMaps[row.map_id] = row.map_data;
        }
      });
    }
    return loadedMaps;
  } catch (err) {
    console.error('Error fetching house maps:', err);
    return { ...maps };
  }
};

// Save single map to Supabase
export const saveHouseMapToDB = async (houseCode: string, mapId: string, mapData: MapDefinition) => {
  try {
    // 1. Also update localStorage cache immediately
    localStorage.setItem('on_house_map_' + mapId, JSON.stringify(mapData));

    // 2. Try upsert into Supabase
    const { error } = await supabase
      .from('house_maps')
      .upsert({
        house_code: houseCode,
        map_id: mapId,
        map_data: mapData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'house_code,map_id' });

    if (error) {
      console.warn('Upsert fallback triggered:', error.message);
      // Fallback check if existing row exists
      const { data: existing } = await supabase
        .from('house_maps')
        .select('id')
        .eq('house_code', houseCode)
        .eq('map_id', mapId)
        .maybeSingle();

      if (existing && existing.id) {
        await supabase
          .from('house_maps')
          .update({
            map_data: mapData,
            updated_at: new Date().toISOString()
          })
          .eq('id', existing.id);
      } else {
        await supabase
          .from('house_maps')
          .insert({
            house_code: houseCode,
            map_id: mapId,
            map_data: mapData,
            updated_at: new Date().toISOString()
          });
      }
    }
  } catch (err) {
    console.error('Error in saveHouseMapToDB:', err);
  }
};

// Fetch custom assets (map tilesets & character sprites) for house code
export const fetchHouseAssets = async (houseCode: string) => {
  try {
    const { data, error } = await supabase
      .from('house_assets')
      .select('asset_type, asset_data')
      .eq('house_code', houseCode);

    if (error) {
      console.warn('Supabase fetchHouseAssets warning:', error.message);
    }

    const mapTilesets: any[] = [];
    const charSprites: any[] = [];

    if (data) {
      data.forEach((row) => {
        if (row.asset_type === 'map_tileset' && row.asset_data) {
          mapTilesets.push(row.asset_data);
        } else if (row.asset_type === 'char_sprite' && row.asset_data) {
          charSprites.push(row.asset_data);
        }
      });
    }

    return { mapTilesets, charSprites };
  } catch (err) {
    console.error('Error fetching house assets:', err);
    return { mapTilesets: [], charSprites: [] };
  }
};

// Save custom asset to Supabase
export const saveHouseAssetToDB = async (houseCode: string, assetType: 'map_tileset' | 'char_sprite', assetData: any) => {
  try {
    const { error } = await supabase
      .from('house_assets')
      .insert({
        house_code: houseCode,
        asset_type: assetType,
        asset_data: assetData,
        updated_at: new Date().toISOString()
      });

    if (error) {
      console.error('Failed to save asset to Supabase:', error.message);
    }
  } catch (err) {
    console.error('Error in saveHouseAssetToDB:', err);
  }
};
