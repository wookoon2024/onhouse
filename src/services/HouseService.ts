import { supabase } from '../lib/supabase';
import { type MapDefinition, maps } from '../game/MapData';

export const getSavedHouseCode = (): string => {
  try {
    if (typeof window !== 'undefined' && window.location) {
      const searchParams = new URLSearchParams(window.location.search);
      let roomParam = searchParams.get('house') || searchParams.get('room');

      if (!roomParam && window.location.hash) {
        roomParam = window.location.hash.replace('#', '');
      }

      if (roomParam && roomParam.trim()) {
        const formatted = roomParam.trim().toUpperCase();
        localStorage.setItem('on_house_current_code', formatted);

        // Clean up URL query param without refreshing page
        const cleanUrl = window.location.origin + window.location.pathname;
        window.history.replaceState({}, document.title, cleanUrl);

        return formatted;
      }
    }
  } catch (e) {}

  return localStorage.getItem('on_house_current_code') || 'H-1001';
};

export const setSavedHouseCode = (code: string) => {
  const formatted = code.trim().toUpperCase() || 'H-1001';
  localStorage.setItem('on_house_current_code', formatted);
  return formatted;
};

// Fetch deleted map IDs list for a house code
export const fetchHouseDeletedMaps = async (houseCode: string): Promise<string[]> => {
  try {
    const localSaved = localStorage.getItem('on_house_deleted_map_ids_' + houseCode);
    const localDeleted: string[] = localSaved ? JSON.parse(localSaved) : [];

    const { data } = await supabase
      .from('house_assets')
      .select('asset_data')
      .eq('house_code', houseCode)
      .eq('asset_type', 'deleted_maps');

    const dbDeleted: string[] = [];
    if (data && data.length > 0) {
      data.forEach((row) => {
        if (row.asset_data && Array.isArray(row.asset_data.deletedIds)) {
          dbDeleted.push(...row.asset_data.deletedIds);
        }
      });
    }

    const merged = Array.from(new Set([...localDeleted, ...dbDeleted]));
    localStorage.setItem('on_house_deleted_map_ids_' + houseCode, JSON.stringify(merged));
    return merged;
  } catch (err) {
    return [];
  }
};

// Save deleted map IDs list to Supabase DB & localStorage
export const saveHouseDeletedMapsToDB = async (houseCode: string, deletedIds: string[]) => {
  try {
    localStorage.setItem('on_house_deleted_map_ids_' + houseCode, JSON.stringify(deletedIds));

    await supabase
      .from('house_assets')
      .delete()
      .eq('house_code', houseCode)
      .eq('asset_type', 'deleted_maps');

    await supabase
      .from('house_assets')
      .insert({
        house_code: houseCode,
        asset_type: 'deleted_maps',
        asset_data: { deletedIds },
        updated_at: new Date().toISOString()
      });
  } catch (err) {}
};

// Fetch or initialize all maps for a given house code
export const fetchHouseMaps = async (houseCode: string): Promise<Record<string, MapDefinition>> => {
  try {
    // 0. Fetch deleted map IDs for this house code
    const deletedMapIds = await fetchHouseDeletedMaps(houseCode);

    // 1. Start with factory default maps (excluding deleted ones)
    const loadedMaps: Record<string, MapDefinition> = {};
    Object.entries(maps).forEach(([id, def]) => {
      if (!deletedMapIds.includes(id)) {
        loadedMaps[id] = def;
      }
    });

    // 2. Load all local map edits stored in localStorage (excluding deleted ones)
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('on_house_map_')) {
        const mapId = key.replace('on_house_map_', '');
        if (!deletedMapIds.includes(mapId)) {
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
    }

    // 3. Fetch from Supabase DB and merge/override with cloud data (excluding deleted ones)
    const { data, error } = await supabase
      .from('house_maps')
      .select('map_id, map_data')
      .eq('house_code', houseCode);

    if (error) {
      console.warn('Supabase fetchHouseMaps warning:', error.message);
    }

    if (data && data.length > 0) {
      data.forEach((row: { map_id: string; map_data: MapDefinition }) => {
        if (!deletedMapIds.includes(row.map_id) && row.map_data && row.map_data.width && row.map_data.height) {
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
    // If map was previously in deleted list, un-delete it when saved!
    const deletedIds = await fetchHouseDeletedMaps(houseCode);
    if (deletedIds.includes(mapId)) {
      const nextDeleted = deletedIds.filter(id => id !== mapId);
      await saveHouseDeletedMapsToDB(houseCode, nextDeleted);
    }

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
    // 1. Add mapId to deletedMapIds for this house
    const deletedIds = await fetchHouseDeletedMaps(houseCode);
    if (!deletedIds.includes(mapId)) {
      deletedIds.push(mapId);
      await saveHouseDeletedMapsToDB(houseCode, deletedIds);
    }

    // 2. Remove from localStorage cache
    localStorage.removeItem('on_house_map_' + mapId);

    // 3. Delete from Supabase house_maps table
    const { error } = await supabase
      .from('house_maps')
      .delete()
      .eq('house_code', houseCode)
      .eq('map_id', mapId);

    if (error) {
      console.warn('Delete house_maps warning:', error.message);
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

// Delete custom asset from Supabase DB
export const deleteHouseAssetFromDB = async (houseCode: string, assetType: 'map_tileset' | 'char_sprite', assetId: string) => {
  try {
    const { error } = await supabase
      .from('house_assets')
      .delete()
      .eq('house_code', houseCode)
      .eq('asset_type', assetType)
      .filter('asset_data->>id', 'eq', assetId);

    if (error) {
      console.warn('Failed to delete asset from DB:', error.message);
    }
    return { success: true };
  } catch (err: any) {
    console.error('Error in deleteHouseAssetFromDB:', err);
    return { success: false };
  }
};
