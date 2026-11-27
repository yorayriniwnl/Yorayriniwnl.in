import concurrent.futures
import json
import os
import urllib.request

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, "..", ".."))
ASSETS_DIR = os.path.join(SCRIPT_DIR, "aaa_assets")
HEADERS = {"User-Agent": "YorayriniwnlWarRoom/1.0 (Blender5.2)"}


def fetch_json(url):
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as r:
        return json.loads(r.read().decode("utf-8"))


def download_file(url, dest):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 512:
        return f"CACHED {os.path.relpath(dest, ASSETS_DIR)}"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
    with open(dest, "wb") as f:
        f.write(data)
    return f"OK ({len(data)//1024}KB) {os.path.relpath(dest, ASSETS_DIR)}"


def collect_polyhaven_model(asset_id):
    data = fetch_json(f"https://api.polyhaven.com/files/{asset_id}")
    gltf_root = data.get("gltf", {})
    tier = gltf_root.get("1k") or gltf_root.get("2k")
    if not tier or "gltf" not in tier:
        raise RuntimeError(f"No gltf tier for {asset_id}")
    entry = tier["gltf"]
    base_dir = os.path.join(ASSETS_DIR, "models", asset_id)
    tasks = []
    main_name = os.path.basename(entry["url"])
    tasks.append((entry["url"], os.path.join(base_dir, main_name)))
    for rel_path, info in entry.get("include", {}).items():
        tasks.append((info["url"], os.path.join(base_dir, rel_path.replace("/", os.sep))))
    return tasks


def collect_polyhaven_texture(asset_id):
    data = fetch_json(f"https://api.polyhaven.com/files/{asset_id}")
    base_dir = os.path.join(ASSETS_DIR, "textures", asset_id)
    tasks = []
    # Map common Poly Haven texture channels: Diffuse/coll1, nor_gl, Rough, AO
    channel_map = [
        ("diff", ("Diffuse", "coll1")),
        ("nor", ("nor_gl",)),
        ("rough", ("Rough",)),
        ("ao", ("AO",)),
    ]
    for short, keys in channel_map:
        for k in keys:
            if k in data:
                tier = data[k].get("1k") or data[k].get("2k")
                if not tier:
                    continue
                fmt = tier.get("jpg") or tier.get("png")
                if fmt and "url" in fmt:
                    ext = "jpg" if "jpg" in tier else "png"
                    tasks.append((fmt["url"], os.path.join(base_dir, f"{short}.{ext}")))
                    break
    return tasks


def main():
    models = [
        "sofa_03",
        "wooden_bookshelf_worn",
        "book_encyclopedia_set_01",
        "chess_set",
        "Lantern_01",
        "classic_laptop",
        "binder_notebook",
        "ammo_box",
        "old_military_crate",
        "fancy_picture_frame_01",
        "potted_plant_01",
        "fern_02",
        "large_castle_door",
        "gothic_coffee_table",
    ]
    textures = [
        "herringbone_parquet",
        "leather_red_02",
        "black_walnut_veneer_01",
        "grey_plaster_02",
        "dark_wooden_planks",
    ]

    all_tasks = []
    print("[1/3] Querying Poly Haven CC0 manifests...")
    for m in models:
        try:
            all_tasks.extend(collect_polyhaven_model(m))
        except Exception as exc:
            print(f"WARN model {m}: {exc}")
    for t in textures:
        try:
            all_tasks.extend(collect_polyhaven_texture(t))
        except Exception as exc:
            print(f"WARN tex {t}: {exc}")

    # Poly Haven HDRI -> public/textures/warroom_env.hdr (1k HDR for fast crisp PBR IBL!)
    hdri_data = fetch_json("https://api.polyhaven.com/files/brown_photostudio_02")
    hdri_url = hdri_data["hdri"]["1k"]["hdr"]["url"]
    all_tasks.append((hdri_url, os.path.join(REPO_ROOT, "public", "textures", "warroom_env.hdr")))

    # MIT Three.js & Khronos Hero Models
    all_tasks.extend([
        (
            "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/Soldier.glb",
            os.path.join(ASSETS_DIR, "hero", "Soldier.glb"),
        ),
        (
            "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF-Binary/DamagedHelmet.glb",
            os.path.join(ASSETS_DIR, "hero", "DamagedHelmet.glb"),
        ),
        (
            "https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/models/gltf/coffeeMug.glb",
            os.path.join(ASSETS_DIR, "hero", "coffeeMug.glb"),
        ),
    ])

    print(f"[2/3] Downloading {len(all_tasks)} AAA CC0/MIT files in parallel...")
    failed = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        futs = {pool.submit(download_file, url, dest): (url, dest) for url, dest in all_tasks}
        for fut in concurrent.futures.as_completed(futs):
            url, dest = futs[fut]
            try:
                res = fut.result()
                print(f"  {res}")
            except Exception as exc:
                failed.append((url, str(exc)))
                print(f"  FAIL {url}: {exc}")

    print(f"[3/3] Done. Total={len(all_tasks)}, Failed={len(failed)}")
    if failed:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
