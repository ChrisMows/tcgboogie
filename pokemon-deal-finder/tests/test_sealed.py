"""Sealed deals: telling product types apart, finding the set, picking the one product (or skipping)."""
import unittest

from dealfinder.sealed import find_set, pick_product, product_type, skip_reason, warnings

SETS = [{"name": n} for n in [
    "ME06: Delta Reign", "ME: 30th Celebration", "ME05: Pitch Black", "ME01: Mega Evolution", "SV: Scarlet & Violet 151",
    "SV: Prismatic Evolutions", "SV01: Scarlet & Violet Base Set", "SWSH07: Evolving Skies", "Celebrations",
    "SWSH: Sword & Shield Promo Cards", "Shining Fates", "SWSH04: Vivid Voltage", "SV: Black Bolt", "SV: White Flare",
    "Base Set", "Hidden Fates", "SV: Paldean Fates",
]]

PE = [
    {"name": "Prismatic Evolutions Pokemon Center Elite Trainer Box (Exclusive)", "tcgPlayerId": "a"},
    {"name": "Prismatic Evolutions Elite Trainer Box (Dollar General Exclusive)", "tcgPlayerId": "b"},
    {"name": "Prismatic Evolutions Elite Trainer Box", "tcgPlayerId": "c"},
    {"name": "Prismatic Evolutions Booster Pack Art Bundle [Set of 4]", "tcgPlayerId": "d"},
    {"name": "Prismatic Evolutions Booster Pack", "tcgPlayerId": "e"},
]

P151 = [
    {"name": "151 Elite Trainer Box", "tcgPlayerId": "1"},
    {"name": "151 Elite Trainer Box Case", "tcgPlayerId": "2"},
    {"name": "151 Pokemon Center Elite Trainer Box (Exclusive)", "tcgPlayerId": "3"},
    {"name": "151 Booster Bundle", "tcgPlayerId": "4"},
    {"name": "151 Booster Bundle Display", "tcgPlayerId": "5"},
    {"name": "151 Booster Bundle Bulk Case", "tcgPlayerId": "6"},
    {"name": "151 Ultra-Premium Collection", "tcgPlayerId": "7"},
    {"name": "151: Zapdos ex Collection", "tcgPlayerId": "8"},
    {"name": "151: Alakazam ex Collection", "tcgPlayerId": "9"},
    {"name": "151 Mini Tin [Gengar & Poliwag]", "tcgPlayerId": "10"},
    {"name": "151 Mini Tin [Dragonite & Vileplume]", "tcgPlayerId": "11"},
    {"name": "Sam's Club 151 (4 Mini Tins + 4 Promo Cards Bundle)", "tcgPlayerId": "12"},
    {"name": "151 Booster Pack", "tcgPlayerId": "13"},
]


class SealedTests(unittest.TestCase):
  def test_product_types(self):
      assert product_type("Pokemon 151 Elite Trainer Box Factory Sealed") == "etb"
      assert product_type("151 ETB sealed") == "etb"
      assert product_type("Pokemon Center Exclusive ETB 151") == "pokemon center etb"
      assert product_type("Pitch Black Booster Box 36 Packs") == "booster box"
      assert product_type("151 Elite Trainer Box Case of 10") == "case"
      assert product_type("Ultra-Premium Collection 151") == "ultra premium collection"
      assert product_type("151 Booster Bundle Display") == "display"


  def test_skips(self):
      assert skip_reason("Lot of 4 Pokemon TCG Mega Evolution Pitch Black Booster Bundle New SEALED")
      assert skip_reason("Pokemon Ancient Roar Booster Packs Scarlet & Violet Japanese New Sealed 15 pack")
      assert skip_reason("151 ETB EMPTY box no packs")
      assert skip_reason("Pokemon 151 Booster Bundle x2 sealed")
      assert skip_reason("Pokemon TCG Mystery Box Sword and Shield")
      assert skip_reason("Pokemon 2020 Sword Shield Vivid Voltage Elite Trainer Box Sealed ETB") is None
      assert skip_reason("Prismatic Evolutions ETB (2024) Factory Sealed") is None  # a year isn't a quantity
      assert warnings("151 ETB sealed - box has a small dent")


  def test_find_set(self):
      assert find_set("Pokémon Mega Evolution Pitch Black Booster Box 12 Packs English", SETS) == "ME05: Pitch Black"
      assert find_set("Pokemon TCG 30th Anniversary Celebration Elite Trainer Box ETB", SETS) == "ME: 30th Celebration"
      assert find_set("Pokemon 151 Elite Trainer Box Sealed", SETS) == "SV: Scarlet & Violet 151"
      assert find_set("Pokemon Scarlet & Violet 151 Booster Bundle", SETS) == "SV: Scarlet & Violet 151"
      assert find_set("Pokémon Scarlet & Violet Prismatic Evolutions Elite Trainer Box", SETS) == "SV: Prismatic Evolutions"
      assert find_set("Pokemon Shining Fates Elite Trainer Box ETB Factory Sealed Sword Shield 2021", SETS) == "Shining Fates"
      assert find_set("Pokemon 2020 Sword Shield Vivid Voltage Elite Trainer Box Sealed ETB", SETS) == "SWSH04: Vivid Voltage"
      assert find_set("Pokemon Celebrations Elite Trainer Box", SETS) == "Celebrations"
      assert find_set("Pokemon Black Bolt ETB", SETS) == "SV: Black Bolt"
      assert find_set("Pokemon Scarlet Violet base set ETB", SETS) == "SV01: Scarlet & Violet Base Set"
      assert find_set("Pokemon booster box sealed", SETS) is None


  def test_pick_product(self):
      s = "SV: Scarlet & Violet 151"
      assert pick_product("Pokemon 151 Elite Trainer Box Factory Sealed", s, P151)[0]["tcgPlayerId"] == "1"
      assert pick_product("Pokemon Center Exclusive 151 ETB", s, P151)[0]["tcgPlayerId"] == "3"
      assert pick_product("151 Booster Bundle sealed", s, P151)[0]["tcgPlayerId"] == "4"
      assert pick_product("151 Booster Bundle Display 10 bundles", s, P151)[0]["tcgPlayerId"] == "5"
      assert pick_product("151 Zapdos ex Collection Box", s, P151)[0]["tcgPlayerId"] == "8"
      assert pick_product("151 Mini Tin Gengar Poliwag", s, P151)[0]["tcgPlayerId"] == "10"
      assert pick_product("151 Collection box sealed", s, P151)[0] is None  # which collection? skip
      assert pick_product("151 Mini Tin sealed", s, P151)[0] is None  # which tin? skip
      assert pick_product("30th Celebration ETB Sealed AND Booster Bundle", s, P151)[0] is None  # two products
      assert pick_product("151 Ultra Premium Collection UPC", s, P151)[0]["tcgPlayerId"] == "7"
      pe = "SV: Prismatic Evolutions"
      assert pick_product("Prismatic Evolutions Elite Trainer Box - Factory Sealed", pe, PE)[0]["tcgPlayerId"] == "c"
      assert pick_product("Prismatic Evolutions ETB Dollar General exclusive", pe, PE)[0]["tcgPlayerId"] == "b"
      assert pick_product("Prismatic Evolutions Booster Pack sealed", pe, PE)[0]["tcgPlayerId"] == "e"
      assert find_set("Pokemon TCG 30th Anniversary Elite Trainer Box ETB", SETS) == "ME: 30th Celebration"
