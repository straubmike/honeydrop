-- HD-18: Atomic reaction toggle inside boards.collections JSONB.
--
-- APPLY BEFORE MERGE (Mike / Supabot). Do not rely on the app alone —
-- without this RPC, concurrent partner reactions still last-write-wins the
-- whole collections blob.
--
-- toggle_item_reaction(board, collection, item, emoji) → jsonb
-- Uses auth.uid() as author. Locks the board row, rewrites only that item's
-- reactions array (and collection updatedAt), bumps boards.updated_at so
-- realtime delivers the change to the partner.

create or replace function public.toggle_item_reaction(
  p_board_id uuid,
  p_collection_id text,
  p_item_id text,
  p_emoji text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_emoji text := trim(p_emoji);
  v_collections jsonb;
  v_collection jsonb;
  v_items jsonb;
  v_item jsonb;
  v_reactions jsonb;
  v_new_reactions jsonb := '[]'::jsonb;
  v_reaction jsonb;
  v_author_ids jsonb;
  v_next_authors jsonb;
  v_has_mine boolean;
  v_action text;
  v_found_collection boolean := false;
  v_found_item boolean := false;
  v_matched_emoji boolean := false;
  v_col_idx int;
  v_item_idx int;
  i int;
  j int;
  k int;
  v_author text;
  v_updated_at text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if p_collection_id is null or length(trim(p_collection_id)) = 0 then
    raise exception 'INVALID_COLLECTION';
  end if;

  if p_item_id is null or length(trim(p_item_id)) = 0 then
    raise exception 'INVALID_ITEM';
  end if;

  if v_emoji is null or length(v_emoji) = 0 or length(v_emoji) > 32 then
    raise exception 'INVALID_EMOJI';
  end if;

  if not public.is_board_member(p_board_id) then
    raise exception 'NOT_A_MEMBER';
  end if;

  v_author := v_uid::text;
  v_updated_at := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');

  select collections into v_collections
  from public.boards
  where id = p_board_id
  for update;

  if not found then
    raise exception 'NOT_FOUND';
  end if;

  if v_collections is null or jsonb_typeof(v_collections) <> 'array' then
    v_collections := '[]'::jsonb;
  end if;

  for i in 0 .. greatest(jsonb_array_length(v_collections) - 1, -1) loop
    v_collection := v_collections->i;
    if v_collection->>'id' = p_collection_id then
      v_found_collection := true;
      v_col_idx := i;
      v_items := coalesce(v_collection->'items', '[]'::jsonb);
      if jsonb_typeof(v_items) <> 'array' then
        v_items := '[]'::jsonb;
      end if;

      for j in 0 .. greatest(jsonb_array_length(v_items) - 1, -1) loop
        v_item := v_items->j;
        if v_item->>'id' = p_item_id then
          v_found_item := true;
          v_item_idx := j;
          v_reactions := coalesce(v_item->'reactions', '[]'::jsonb);
          if jsonb_typeof(v_reactions) <> 'array' then
            v_reactions := '[]'::jsonb;
          end if;

          for k in 0 .. greatest(jsonb_array_length(v_reactions) - 1, -1) loop
            v_reaction := v_reactions->k;
            if v_reaction->>'emoji' = v_emoji then
              v_matched_emoji := true;
              v_author_ids := coalesce(v_reaction->'authorIds', '[]'::jsonb);
              if jsonb_typeof(v_author_ids) <> 'array' then
                v_author_ids := '[]'::jsonb;
              end if;

              select exists (
                select 1
                from jsonb_array_elements_text(v_author_ids) as aid(value)
                where aid.value = v_author
              ) into v_has_mine;

              if v_has_mine then
                v_action := 'removed';
                select coalesce(jsonb_agg(to_jsonb(aid.value)), '[]'::jsonb)
                into v_next_authors
                from jsonb_array_elements_text(v_author_ids) as aid(value)
                where aid.value <> v_author;

                if jsonb_array_length(v_next_authors) > 0 then
                  v_new_reactions := v_new_reactions || jsonb_build_array(
                    jsonb_build_object('emoji', v_emoji, 'authorIds', v_next_authors)
                  );
                end if;
              else
                v_action := 'added';
                v_next_authors := v_author_ids || to_jsonb(v_author);
                v_new_reactions := v_new_reactions || jsonb_build_array(
                  jsonb_build_object('emoji', v_emoji, 'authorIds', v_next_authors)
                );
              end if;
            else
              v_new_reactions := v_new_reactions || jsonb_build_array(v_reaction);
            end if;
          end loop;

          if not v_matched_emoji then
            v_action := 'added';
            v_new_reactions := v_new_reactions || jsonb_build_array(
              jsonb_build_object(
                'emoji', v_emoji,
                'authorIds', jsonb_build_array(v_author)
              )
            );
          end if;

          v_item := v_item || jsonb_build_object('reactions', v_new_reactions);
          v_items := jsonb_set(v_items, array[v_item_idx::text], v_item, false);
          exit;
        end if;
      end loop;

      if v_found_item then
        v_collection := v_collection
          || jsonb_build_object('items', v_items, 'updatedAt', v_updated_at);
        v_collections := jsonb_set(
          v_collections,
          array[v_col_idx::text],
          v_collection,
          false
        );
      end if;
      exit;
    end if;
  end loop;

  if not v_found_collection then
    raise exception 'COLLECTION_NOT_FOUND';
  end if;

  if not v_found_item then
    raise exception 'ITEM_NOT_FOUND';
  end if;

  update public.boards
  set
    collections = v_collections,
    updated_at = timezone('utc', now())
  where id = p_board_id;

  return jsonb_build_object(
    'ok', true,
    'board_id', p_board_id,
    'collection_id', p_collection_id,
    'item_id', p_item_id,
    'emoji', v_emoji,
    'action', v_action,
    'reactions', v_new_reactions
  );
end;
$$;

revoke all on function public.toggle_item_reaction(uuid, text, text, text) from public;
grant execute on function public.toggle_item_reaction(uuid, text, text, text) to authenticated;

comment on function public.toggle_item_reaction(uuid, text, text, text) is
  'Atomically toggle auth.uid() on one item reaction emoji inside boards.collections JSONB.';
