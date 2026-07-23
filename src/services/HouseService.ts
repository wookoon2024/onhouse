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
    // 1. Start with factory default maps
    const loadedMaps: Record<string, MapDefinition> = { ...maps };

    // 2. Load all local map edits stored in localStorage
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('on_house_map_')) {
        const mapId = key.replace('on_house_map_', '');
        try {
          const val = localStorage.getItem(key);
          if (val) {
            const parsed = JSON.parse(val);
            if (parsed && parsed.width && parsed.height && Array.isArray(parsed.baseLayer)) {
              loadedMaps[mapId] = parsed;
            }
          }
        } catch (e) {}
      }
    }

    // 3. Fetch from Supabase DB and merge/override with cloud data
    const { data, error } = await supabase
      .from('house_maps')
      .select('map_id, map_data')
      .eq('house_code', houseCode);

    if (error) {
      console.warn('Supabase fetchHouseMaps warning:', error.message);
    }

    if (data && data.length > 0) {
      data.forEach((row: { map_id: string; map_data: MapDefinition }) => {
        if (row.map_data && row.map_data.width && row.map_data.height) {
          loadedMaps[row.map_id] = row.map_data;
          try {
            localStorage.setItem('on_house_map_' + row.map_id, JSON.stringify(row.map_data));
          } catch (e) {}
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
export const saveHouseMapToDB = async (
  houseCode: string,
  mapId: string,
  mapData: MapDefinition
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Also update localStorage cache immediately
    localStorage.setItem('on_house_map_' + mapId, JSON.stringify(mapData));

    // 2. Try upsert into Supabase
    const { error: upsertErr } = await supabase
      .from('house_maps')
      .upsert({
        house_code: houseCode,
        map_id: mapId,
        map_data: mapData,
        updated_at: new Date().toISOString()
      }, { onConflict: 'house_code,map_id' });

    if (!upsertErr) {
      return { success: true };
    }

    console.warn('Upsert fallback triggered:', upsertErr.message);

    // Fallback check if existing row exists
    const { data: existing, error: selectErr } = await supabase
      .from('house_maps')
      .select('id')
      .eq('house_code', houseCode)
      .eq('map_id', mapId)
      .maybeSingle();

    if (selectErr) {
      console.error('Failed to select existing house map:', selectErr.message);
      return { success: false, error: upsertErr.message || selectErr.message };
    }

    if (existing && existing.id) {
      const { error: updateErr } = await supabase
        .from('house_maps')
        .update({
          map_data: mapData,
          updated_at: new Date().toISOString()
        })
        .eq('id', existing.id);

      if (updateErr) {
        console.error('Failed to update house map:', updateErr.message);
        return { success: false, error: updateErr.message };
      }
    } else {
      const { error: insertErr } = await supabase
        .from('house_maps')
        .insert({
          house_code: houseCode,
          map_id: mapId,
          map_data: mapData,
          updated_at: new Date().toISOString()
        });

      if (insertErr) {
        console.error('Failed to insert house map:', insertErr.message);
        return { success: false, error: insertErr.message };
      }
    }

    return { success: true };
  } catch (err: any) {
    console.error('Error in saveHouseMapToDB:', err);
    return { success: false, error: err?.message || 'DB 저장 중 예외 발생' };
  }
};

// Delete map permanently from Supabase DB & localStorage
export const deleteHouseMapFromDB = async (
  houseCode: string,
  mapId: string
): Promise<{ success: boolean; error?: string }> => {
  try {
    // 1. Remove from localStorage cache
    localStorage.removeItem('on_house_map_' + mapId);

    // 2. Delete from Supabase house_maps table
    const { error } = await supabase
      .from('house_maps')
      .delete()
      .eq('house_code', houseCode)
      .eq('map_id', mapId);

    if (error) {
      console.error('Failed to delete map from Supabase:', error.message);
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteHouseMapFromDB:', err);
    return { success: false, error: err?.message || 'DB 맵 삭제 중 예외 발생' };
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
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error in saveHouseAssetToDB:', err);
    return { success: false, error: err?.message || 'DB 에셋 저장 실패' };
  }
};
