import ast
import csv
import json
import math
import struct
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "openai-cookbook-main" / "examples" / "data" / "sample_clothes"
CSV_PATH = SOURCE / "sample_styles_with_embeddings.csv"
OUTPUT_DIR = ROOT / "data"

STORES = [
    "Chicago Loop",
    "Dallas NorthPark",
    "New York Herald Square",
    "San Francisco Centre",
]


def hash_int(*parts):
    value = 2166136261
    for part in parts:
        for char in str(part):
            value ^= ord(char)
            value = (value * 16777619) & 0xFFFFFFFF
    return value


def price_for(row):
    article = row["articleType"].lower()
    base = 42
    if "shoe" in article or "heel" in article or "sandal" in article or "flop" in article:
        base = 76
    elif article in {"dresses", "sarees", "kurtas", "jackets", "suits"}:
        base = 118
    elif article in {"shirts", "tops", "tshirts"}:
        base = 54
    elif article in {"jeans", "trousers", "shorts", "skirts"}:
        base = 68
    usage_multiplier = {
        "Formal": 1.25,
        "Smart Casual": 1.15,
        "Ethnic": 1.18,
        "Sports": 1.05,
        "Casual": 1.0,
    }.get(row["usage"], 1.0)
    jitter = hash_int(row["id"], "price") % 38
    return int(round((base + jitter) * usage_multiplier))


def inventory_for(row):
    stock = {}
    for store in STORES:
        seed = hash_int(row["id"], store)
        if seed % 11 == 0:
            qty = 0
        elif seed % 7 == 0:
            qty = 1
        else:
            qty = 2 + (seed % 9)
        stock[store] = qty
    return stock


def normalize(vector):
    norm = math.sqrt(sum(v * v for v in vector))
    if norm == 0:
        return vector
    return [v / norm for v in vector]


def main():
    OUTPUT_DIR.mkdir(exist_ok=True)
    products = []
    with CSV_PATH.open(newline="", encoding="utf-8") as f, (OUTPUT_DIR / "embeddings.f32").open("wb") as vectors:
        reader = csv.DictReader(f)
        for index, row in enumerate(reader):
            embedding = normalize(ast.literal_eval(row["embeddings"]))
            vectors.write(struct.pack(f"{len(embedding)}f", *embedding))
            products.append(
                {
                    "index": index,
                    "id": int(row["id"]),
                    "gender": row["gender"],
                    "masterCategory": row["masterCategory"],
                    "subCategory": row["subCategory"],
                    "articleType": row["articleType"],
                    "baseColour": row["baseColour"],
                    "season": row["season"],
                    "year": row["year"],
                    "usage": row["usage"],
                    "productDisplayName": row["productDisplayName"],
                    "price": price_for(row),
                    "inventory": inventory_for(row),
                    "trendScore": 52 + (hash_int(row["id"], "trend") % 45),
                    "image": f"/catalog-images/{row['id']}.jpg",
                }
            )

    metadata = {
        "embeddingDimensions": 3072,
        "productCount": len(products),
        "stores": STORES,
        "source": str(CSV_PATH.relative_to(ROOT.parent)),
    }
    (OUTPUT_DIR / "products.json").write_text(json.dumps(products, indent=2), encoding="utf-8")
    (OUTPUT_DIR / "metadata.json").write_text(json.dumps(metadata, indent=2), encoding="utf-8")
    print(f"Prepared {len(products)} products and normalized embeddings.")


if __name__ == "__main__":
    main()
