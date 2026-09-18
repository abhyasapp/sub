/* ══════════════════════════════════════════════════════════════════════
   CHAPTERS-DATA.JS — ABHYAS
   ──────────────────────────────────────────────────────────────────────
   Level 5 (Diploma), Level 7 (Engineering), and General Knowledge.
   Every chapter has a single book: 'Abhyas'.
   Subtopics map to Drive JSON files with stable file_ids.

   Raw data shape:
     CH_NAMES[levelId][chapterNum]          → "Chapter name"
     LEVEL_LABELS[levelId]                  → "Level 5 — Diploma"
     DRIVE[levelId][chapterNum][book][sub]  → fileId (string) or null

   Exposes window.ChapterData with the API app.js / objective.js call:
     levels()                → ['gk','level5','level7']
     levelLabel(lv)          → "Level 5 — Diploma"
     chapters(lv)            → { [ch]: name, … }
     chapterName(lv, ch)     → "Surveying"
     books(lv, ch)           → { [book]: { [subtopic]: fid, … }, … }
     files(lv, ch, book)     → { [subtopic]: fid, … }
     chapterFileRefs(lv, ch) → flat [{ lv, ch, book, subtopic, fid, key, name }]
     allFileRefs()           → same, across every level
     fileCount(lv[, ch[, book]]) → count of non-null fileIds
   ══════════════════════════════════════════════════════════════════════ */

const CH_NAMES = {
  "gk": {
    "1": "General Awareness",
    "2": "Public Management"
  },
  "level5": {
    "1": "Surveying",
    "2": "Construction Materials",
    "3": "Mechanics of Materials and Structures",
    "4": "Hydraulics",
    "5": "Soil Mechanics",
    "6": "Structural Design",
    "7": "Building Construction Technology",
    "8": "Water Supply and Sanitation",
    "9": "Irrigation Engineering",
    "10": "Highway Engineering",
    "11": "Estimating and Costing",
    "12": "Construction Management",
    "13": "Airport Engineering"
  },
  "level7": {
    "1": "Structural Engineering",
    "2": "Engineering Survey",
    "3": "Construction Materials",
    "4": "Concrete Technology",
    "5": "Geotechnical Engineering",
    "6": "Construction Management",
    "7": "Estimating & Costing",
    "8": "Engineering Drawing",
    "9": "Engineering Economics",
    "10": "Professional Practices"
  }
};

const LEVEL_LABELS = {
  "gk": "General Knowledge (shared)",
  "level5": "Level 5 — Diploma",
  "level7": "Level 7 — Engineering"
};

const DRIVE = {
  "gk": {
    "1": {
      "Abhyas": {
        "1.1 GEO&DEMO": "1Blbxd3mWlMvDpAWd_KfVItE2CzjajB_o",
        "1.10 CURRENT AFFAIRS": "1y3jaSI-VZmCdFMJzxl86RvApgmliOHXa",
        "1.2 NAT RESOURCES": "1q5iUoCqqEuo5W6oXM-fJOhO2xueyZG7v",
        "1.3 PERIODIC PLAN (part 1)": "1LrNN8hq49hwFkqp543ux32wUURHf0POn",
        "1.3 PERIODIC PLAN (part 2)": "1JAKi7CXryPgqCWwQZ9USB8DTpXI5wRk0",
        "1.4 SUST DEV&ENV (part 1)": "1d9B_tg6vDDJqXwLkfAzKr0Xr4-rIFZu-",
        "1.4 SUST DEV&ENV (part 2)": "1UgaWd26bxEMIErOZg3SVgrP5C0ltRqpN",
        "1.5 SCIENCE & TECH": "1XPHP6rmQR4lAJIepx62LJQmuW9RGYKX-",
        "1.6 PUBLIC HEALTH": "1c2GTXlBxBSZCiUB3VSKCLGNw_Ku3s72i",
        "1.7 CONSTITUTION (part 1)": "1-DN36n2dFaoDwF5vug1CJeb-M8XZlx84",
        "1.7 CONSTITUTION (part 2)": "1_tKTMwfcYo9tbpheG7hIzyAPVV5zOn4w",
        "1.8 INTL AFFAIRS (part 1)": "1FROU3veGTxUWMwfKID26bePGQc_h7_Ja",
        "1.8 INTL AFFAIRS (part 2)": "1Dpm9jsnzAFWB4PCyepDOxJTl30XEvpe9",
        "1.8 INTL AFFAIRS (part 3)": "1gYOMUS3EGchj0NTv2BDXtaa9QmK4bR6P",
        "1.9 REGIONAL ORGS (part 1)": "1hHgCLiUtMQAEwfXminh2whbF5M15T5SN",
        "1.9 REGIONAL ORGS (part 2)": "1ysZaMsiHR2kEhR7A5hF0c3FGfkCC3vQv",
        "1.9 REGIONAL ORGS (part 3)": "1e37ItS29JSwMUM7ER0NezXHhNZ0X5N3o",
        "UNCLASSIFIED Unclassified questions": "168s0a7JTGpD2EmEGTyVWKaPmhgPYA9In"
      }
    },
    "2": {
      "Abhyas": {
        "2.1 OFFICE MGMT": "1ULqyJRfhKBvqB-zhPZcSdTwCXaAPHNHe",
        "2.10 HUMAN VALUES": "1hxiZfRORqtjPkVTZYCgPnaRLufqe2MOO",
        "2.2 CIVIL SERVICE ACT (part 1)": "1XfZ-vTpLlgguT92yG74sAUA0Er72d3oN",
        "2.2 CIVIL SERVICE ACT (part 2)": "1A6tAmJNup2_z0BopQI2vZ1J4rUz33gUM",
        "2.3 FEDERAL MINISTRY": "15nf-yC5b_xDht00ZUYGgxygL23e3ye-7",
        "2.4 CONSTITUTIONAL BODIES": "17J7rlJl6xWoiSuqwL9JCCzZlZRjMryNh",
        "2.5 BUDGET & ACCOUNTING": "1Ezj_uErsMTwTSILn-TjjbcqFny67mSs4",
        "2.6 SERVICE DELIVERY": "1YDplOgQO5hIDEPr_ilI6I2sdh8QPvBXx",
        "2.7 GOVERNANCE (part 1)": "1XRo8LWVoMYsCm8v0DWncxIOrBw8PxpKY",
        "2.7 GOVERNANCE (part 2)": "1Tgdl5atSm4QXG47Zq4geaciygIRk2DNz",
        "2.7 GOVERNANCE (part 3)": "1BzO3KGksqnEJOBin2Yk2biFAF6nG8Tgx",
        "2.8 PUBLIC CHARTER": "1E69H-6gQEnfmT8Ek7207hO1ORpaOTxFw",
        "2.9 MGMT FUNDAMENTALS (part 1)": "1LkFvBbtG4YQ0ads12bTc1BZpo2-Krb1X",
        "2.9 MGMT FUNDAMENTALS (part 2)": "1DisDBA6h4e0FBub6C7Wt2a5Tn92MddRm",
        "2.9 MGMT FUNDAMENTALS (part 3)": "10O_Nxw4nzp8AqUh-XmShNvJNu0tTuejg",
        "2.9 MGMT FUNDAMENTALS (part 4)": "116VSEj3FbWRA8qwRqTI3-jQXF42JFRXx",
        "2.9 MGMT FUNDAMENTALS (part 5)": "1Yq7FdybWuDV-8ggErjNsThXrluUkcSGT",
        "2.9 MGMT FUNDAMENTALS (part 6)": "1STi-KYWTchvNgjtmA-T90SsFGCrzXFzv",
        "UNCLASSIFIED Unclassified questions": "1PPnqXVQTDCiSwjoTNzUHkB51d0E9257S"
      }
    }
  },
  "level5": {
    "1": {
      "Abhyas": {
        "1.1 General (part 1)": "1QS9jz8BHZqthMF5KmZdDrAetETbXIpKZ",
        "1.1 General (part 2)": "1QRLMx8OIMTCOwuC7hHZ0ZPUHrf2EP8Rm",
        "1.1 General (part 3)": "1asVCOtFAbzRG7ZgXnL8e8uDgCtzCuIxk",
        "1.1 General (part 4)": "1fPMMw4u0ITFCDZQ-4Gkph1s74gCzQNjV",
        "1.2 Levelling (part 1)": "1sAO2gn6hJC_82yJtCDnXU2kYFSoI7-Sm",
        "1.2 Levelling (part 2)": "1Bf3px6S__H2WAi8F5awx1sk3VCDx3L50",
        "1.2 Levelling (part 3)": "1E9lsx8ic51QlUvj4G9l1mmx1T6K5CQGB",
        "1.2 Levelling (part 4)": "1dFG6EFtnCeX3Y5SlAUOBpYf4dLC_6LXM",
        "1.3 Plane Tabling": "1G7gHSB8pxya6-RhdKvgdkOIqTzL0KYPd",
        "1.4 Theodolite and Traverse (part 1)": "1vBAM7Flm8kHyePXnmZdy3UuisUszB-SK",
        "1.4 Theodolite and Traverse (part 2)": "1k5dSoWSzwMb9kE5q9b95bDOYxWah_w8O",
        "1.4 Theodolite and Traverse (part 3)": "1n8eyjGH3Akn7kTHCZRT7Jn6XFo4JzCsi",
        "1.5 Contouring": "1kCzQ6xWz_SO62hmOoY4bC8ZMugyeBm6F",
        "1.6 Setting Out": "1eNRAJFL2oarxEIhQxGfZwJrAvm0wJ69s",
        "UNCLASSIFIED Unclassified questions": "1fuK-6_Cglr7B41W95J1ypp6x0GDqBY1d"
      }
    },
    "2": {
      "Abhyas": {
        "2.1 Stone (part 1)": "1q9Th3JN_WFqvD2jijujx8ZJqNHNjrYmh",
        "2.1 Stone (part 2)": "1CjEoxdaqGPQPxAoDhd-knqtolM59Us5B",
        "2.1 Stone (part 3)": "1Vo0p-mkRXPNg_rwfertkfgmq6GTi-a9g",
        "2.2 Cement (part 1)": "1Oxj6Na8t8vCIWlhyGushQzjSbpwajysh",
        "2.2 Cement (part 2)": "1S5XKN9maVU2nA6rM887m4fud7JSzfb0q",
        "2.2 Cement (part 3)": "1HhCrRcINO7YrLyNExsLAWTJE1F6w04y_",
        "2.2 Cement (part 4)": "17zQjzyWHx449hStbSIhI-oUrUEi0OLXE",
        "2.3 Clay and Clay Products (part 1)": "1WNm-7e2m2b8gRj_hMQaDPmeRW_hQK6wG",
        "2.3 Clay and Clay Products (part 2)": "1vwDaPlRIUoc4v_6f53AB_FGwsQ8XgtIV",
        "2.4 Paints and Varnishes (part 1)": "1xsSvvgSVln4Zb27JWaD6GhqoBCIz25uV",
        "2.4 Paints and Varnishes (part 2)": "1Pq9Lq2NrneBL4wDnooOyn-6l_BOcNEeF",
        "2.5 Bitumen": "14QcW_1UjwB5-RvNO1bvLGmv7YrLoGFsO",
        "UNCLASSIFIED Unclassified questions (part 1)": "1LrFAM_BwenfMwMSaAfaszV3bfyemMwpt",
        "UNCLASSIFIED Unclassified questions (part 2)": "1Jwe55Aoph4lZEQewPb4Oe5vFk7EZkH0Y",
        "UNCLASSIFIED Unclassified questions (part 3)": "1NQg9rL1tJHWRF3arBpZ4_beACAltJUyd",
        "UNCLASSIFIED Unclassified questions (part 4)": "1IHHhVTYsMdmA3MRbsj-ol1PE8L92KOIA"
      }
    },
    "3": {
      "Abhyas": {
        "3.1 Mechanics of Materials (part 1)": "18I7XVGjRzn1j7cD6S2ifZpqeBaA4JSWt",
        "3.1 Mechanics of Materials (part 2)": "1-OGvWVlNc561gO1HwsS5IwHNnRG1qSEQ",
        "3.1 Mechanics of Materials (part 3)": "19sdkZm-7qvwpOd3haoZ6j0BIYLtfT5tR",
        "3.1 Mechanics of Materials (part 4)": "19SwUHLsjTRGTdOUpgLwxoVwLgbh16qsN",
        "3.1 Mechanics of Materials (part 5)": "1MKPMwmRF7-L7VXhI9d-pqVV1r-v-1-F9",
        "3.1 Mechanics of Materials (part 6)": "1eFZb_H5ydbdor-RUDqQ2sAvjW0zdZE8P",
        "3.1 Mechanics of Materials (part 7)": "1hWip_sKKscobMKYBvqUjMJ2CG0v1b_1A",
        "3.2 Mechanics of Beams (part 1)": "1jbDZYrfcbONjBOtu4eK_5LaBusxykQDf",
        "3.2 Mechanics of Beams (part 2)": "13v1xoASv3T5c_FXVSenGyY5ZS8hQN5s6",
        "3.2 Mechanics of Beams (part 3)": "1Nq6891k9lzq8KaXH3aIcOYQh4CpStGqo",
        "3.2 Mechanics of Beams (part 4)": "1KPC2Ez2SWR9C-GrCNJoOh30KsqE-cW2X",
        "3.2 Mechanics of Beams (part 5)": "1ko6p0H5XCsj1ZqCoujeV5_oEdKAl3hlG",
        "3.2 Mechanics of Beams (part 6)": "1bXWR-_Slj1PzKNZ__sI1Qul-YYLUnYPL",
        "3.3 Simple Strut Theory (part 1)": "1iKYkVKAnNlB2A52LnZdaG0R5tuWOh-xm",
        "3.3 Simple Strut Theory (part 2)": "1Y4KAGFQ8494PI5Coq_4R8P4BTwY8w-D0",
        "UNCLASSIFIED Unclassified questions": "191XriOJ6smy0aUpWJGM50hup-a9s-0F2"
      }
    },
    "4": {
      "Abhyas": {
        "4.1 General (part 1)": "1Yl-8_03YIYlr7zIe_B9J1C9y0-eAcNFg",
        "4.1 General (part 2)": "1ql1q5J9mQdugTR4ywOyX0NZB_Pi99tZT",
        "4.1 General (part 3)": "1YMgX7ek0yqoCXvvAD9te0LvKyaTIJ8E9",
        "4.1 General (part 4)": "15Cpu0bO009KEGcMrHXLUek1q42JyVpz-",
        "4.2 Hydro-Kinematics and Dynamics (part 1)": "14IovgbNovlBzwcOMNd1AFz5kLmAFMsXI",
        "4.2 Hydro-Kinematics and Dynamics (part 2)": "1hQvRD10Gdun02Or5ceyg5FXUP1J5TkZP",
        "4.3 Measurement of Discharge (part 1)": "186km2_ib4fMXhuAsgHdJliYTbBwKGRkD",
        "4.3 Measurement of Discharge (part 2)": "10xjAUEG4N6i4y7Z1ZPQpPMp3r2Pwk6t3",
        "4.3 Measurement of Discharge (part 3)": "12qc2LGsXbVlfUU_vM0lnxuu_53vCOruY",
        "4.4 Flows (part 1)": "1wlsGRqa36H43OJF3DuGvodrhc4j9ZVTR",
        "4.4 Flows (part 2)": "1FjIvDH0jOcnYkRiueGBhxQwL_PxA4Emn",
        "4.4 Flows (part 3)": "1SPMMAg_ZM6jZhHBqdojAB7SePMbr3JfU"
      }
    },
    "5": {
      "Abhyas": {
        "5.1 General (part 1)": "1ZpyIswSQDBvkUeAqZ8-VDPInNPxHWhsC",
        "5.1 General (part 2)": "1Kf9YeNNPih2MDTA4WNcoPgKsm2gr9_ic",
        "5.1 General (part 3)": "1cmKa_2GxTQ6zPAV0JfizXXOXnHo7GnBm",
        "5.1 General (part 4)": "16YcWVO4287_DE0_PwDlVIK20iUaMxVmu",
        "5.2 Soil Water Relation (part 1)": "1GqNbW82336TLJr2yw82Z8xs0zTNkkQjH",
        "5.2 Soil Water Relation (part 2)": "1XZCFQDWQJ2XAIH1i4gbe55UKtATZoE2Q",
        "5.3 Compaction of Soil": "10DPMqPAB_oKKzyHj4pQZcDgBdz5x4ugk",
        "5.4 Shear Strength of Soils": "1tDqnhu6xs1sSYVnJeD_L2NzkhPOb8omr",
        "5.5 Earth Pressures": "1fJrUHupjTvtQTYjibCODWUjU0No9F46W",
        "5.6 Foundation Engineering (part 1)": "1cwtaEbtkLuS-jTgJ6N-LUgD8ox1dC-XC",
        "5.6 Foundation Engineering (part 2)": "1iYhPJ_UabI8ECUFBA0LKdqoGDnOOQTPl",
        "UNCLASSIFIED Unclassified questions": "1ZMjYZoeED-ushTg0amSmRDNTT59hKOj8"
      }
    },
    "6": {
      "Abhyas": {
        "6.1 RC Sections in Bending (part 1)": "1e1hRG9KFfg4GsXBH-NmaJ4I8kGWH0nr5",
        "6.1 RC Sections in Bending (part 2)": "1A4-eh6jurGFu-mGc8hNfuII0v5jeSPb4",
        "6.1 RC Sections in Bending (part 3)": "17TShKlTRaNAoeFylVOCxzwVZAEsYS98M",
        "6.1 RC Sections in Bending (part 4)": "18sVlPMbWnmnv2bbNaRDyp9oO6rZxW5sx",
        "6.2 Shear and Bond for RC (part 1)": "1YIQHgNUD5KGtFIHsroaxm-z_FZLGy_X9",
        "6.2 Shear and Bond for RC (part 2)": "1HL4GwL_Ggp2rR_4Jnsqc0-YWG_ExIkqv",
        "6.3 Axially Loaded RC Columns (part 1)": "1pbZKCfkWoGPqE5Pts-M4jEWW1rAVvNUn",
        "6.3 Axially Loaded RC Columns (part 2)": "1umpGLm2GGlWGXLUZppRMnylFr2ePLIni",
        "6.4 Design and Drafting of RC (part 1)": "1Gxi7T8jgm9EG6GdoxxfVJzP4FnxqA6ev",
        "6.4 Design and Drafting of RC (part 2)": "1owHzhpjZ-VF6xmqpCZuuOMh-9u-VJWWN",
        "UNCLASSIFIED Unclassified questions (part 1)": "1p9iYSeh4C3O3slC-S1pOG1PqmskUYnkY",
        "UNCLASSIFIED Unclassified questions (part 2)": "14EiEcCyb3n4lfcSyI9R_GGWoM5VNrFxa"
      }
    },
    "7": {
      "Abhyas": {
        "7.1 Foundations (part 1)": "13w6CYuOiHKqTVyoLoOFGyYJQsKwvRm4-",
        "7.1 Foundations (part 2)": "1YKNq5gZy3_uQ2GHFhWI-CjS7_bcJGz-q",
        "7.1 Foundations (part 3)": "1mCBdY3Tr1zoriZjlL8grKIfL2v-pfo7Y",
        "7.1 Foundations (part 4)": "1ITKH9lGXIqazo-P5XEemeh3VUr1BaroG",
        "7.2 Walls (part 1)": "1pvegv3iGcXjv74hLttBZWCEKaPXzWNXC",
        "7.2 Walls (part 2)": "1N8sy1c49vxWkI8pK5iHCyXjcGOGtYjeR",
        "7.2 Walls (part 3)": "1uebMGqH2P7kQACnf8wUE2Ybxo0r664xg",
        "7.2 Walls (part 4)": "1Ca4ykbCnxyszYAA5bUHWBZQJzZvRv0n-",
        "7.2 Walls (part 5)": "1OsuSs51w21j4zQ19nUNmZgBrZyGXfF7a",
        "7.3 Damp Proofing": "1k1MafGxS5-Vqdl5cPeubhUjYX6yqzTt-",
        "7.4 Concrete Technology (part 1)": "1jEdqRUcZBtjtzbi6naun9lTxZO0bAv4r",
        "7.4 Concrete Technology (part 2)": "1STqsdKWbXqfBfzm6hIrKVMcCdRLICP7f",
        "7.4 Concrete Technology (part 3)": "1foWhTyFE1KuUcv1W8B-g9K2RtXd3_UuQ",
        "7.4 Concrete Technology (part 4)": "1_x9KrU0SZ3sHZroLsi5K_12kTdWoaJma",
        "7.4 Concrete Technology (part 5)": "1xfNlxotnj7Q42d8rYMmZUgIADhMIpbrK",
        "7.5 Wood Work (part 1)": "1Rb1I5_tOSBnN2Kh4gE94MB12BSfSlQSv",
        "7.5 Wood Work (part 2)": "1JdnbQ36fxGf1Q-6dktZOPOnYVLo9OoDV",
        "7.5 Wood Work (part 3)": "1ioF3CS_z12ntjoBI1hxh4pyv73PjVcP1",
        "7.5 Wood Work (part 4)": "1TlJbNZVkq0AZoca5ojQ5MQ6C4_QooQw2",
        "7.6 Flooring and Finishing (part 1)": "12nU77pxu01UousR8RDY1AZoEhchAQeOS",
        "7.6 Flooring and Finishing (part 2)": "1L6AQcrW_6i9AvhLkctbUnl9aT6rZS6LA",
        "7.6 Flooring and Finishing (part 3)": "1z9F2AvzL85zdYfpABtrmr4h4mARNMukW",
        "UNCLASSIFIED Unclassified questions (part 1)": "1mefJMCflvjSfRQcd8PuFzUu36CXjiosN",
        "UNCLASSIFIED Unclassified questions (part 2)": "1VTOJvKRqMSEX_e1-_Y3JN5EugoJo3oD8"
      }
    },
    "8": {
      "Abhyas": {
        "8.1 General (part 1)": "1mae50_GC0oB8_A193UyNyKKMB5iSzJmg",
        "8.1 General (part 2)": "1pKuwmNVwQQv48ndrhKkmozvUhLrrYtP6",
        "8.1 General (part 3)": "1vCaF0KHEwEYPFR0qcp-wXlxfpOJ-V0u-",
        "8.1 General (part 4)": "11lYj0YczxrfNP-D8ooMGp6q-AOigvJn0",
        "8.1 General (part 5)": "1r1mobpYvzfzihTm-joEpevoaZbYTLp0e",
        "8.1 General (part 6)": "130O2izvyyaJFfpQgSLZ-EiB1juIEYtT6",
        "8.1 General (part 7)": "1Mql89SX5Gpx850YF_oV_aUng8tA3BIpc",
        "8.1 General (part 8)": "1EagBCTDP_UWhJYT1mX_WV84L1_jQDKmD",
        "8.2 Gravity Water Supply System": "1OifiEZumBwrub1K6jsg0MPSlLVjGdy9e",
        "8.3 Design of Sewer (part 1)": "17Z_Em4DZ_LAjwdZ2U1A58d5TnMD2r8f_",
        "8.3 Design of Sewer (part 2)": "1wMUDgIPZanl1o5aOryuwAlb_S8fGm1_t",
        "8.3 Design of Sewer (part 3)": "17lIRCRwoa0lLThHoIbK18P_mOvJfB8cL",
        "8.4 Excreta Disposal (part 1)": "1igNiasy8MvwFiW-1EtRkVelEzGcKK4Ga",
        "8.4 Excreta Disposal (part 2)": "1aBevQJrD0_V8CKawRW5UeFnEyWl7BwUx",
        "UNCLASSIFIED Unclassified questions": "1r9NMHyWsi3MCey7M7YjMvuXupEG8iruQ"
      }
    },
    "9": {
      "Abhyas": {
        "9.1 General (part 1)": "1fdyudGhdYfozogN4O6j1RzuBrFxoJfC9",
        "9.1 General (part 2)": "1aBNF-dQiMHltNje0-Tir6lnuKUe_9XIY",
        "9.2 Crop Water Requirement (part 1)": "1iHl2YsHzT6-vICRJ82OsSswhI4-dcPm2",
        "9.2 Crop Water Requirement (part 2)": "1pglrDDhRt04R7kVVp7FAqonmMOuTxeJp",
        "9.3 Irrigation Canals (part 1)": "16EA6ttlV7KU8JfmYBEAgIql7FIjIGxg8",
        "9.3 Irrigation Canals (part 2)": "1eN9AMg_cmFq6d-XwOvyTk7bGr2yTSD2p",
        "9.3 Irrigation Canals (part 3)": "1zEa0_QPrLmUSke-x_YTI9nvUzocC4NJ7",
        "9.3 Irrigation Canals (part 4)": "1Xmflf76oILf4skEhUrD-yO2MFUm-F9ol",
        "9.3 Irrigation Canals (part 5)": "1Otb2-BsNv9UrPfaFo6Di9L5OWJymTUkI",
        "UNCLASSIFIED Unclassified questions": "1ANsrU2Z1ZvDDssb432Ul2QZPhqscxdLv"
      }
    },
    "10": {
      "Abhyas": {
        "10.1 General": "1xEv8HVeyAjRoHPjUidUPA8QyhYLpd6O7",
        "10.2 Geometric Design (part 1)": "1ExxJFKOoOn2f6fFI6WrZGFRAIiOGe-xe",
        "10.2 Geometric Design (part 2)": "1cPHbFrkH3Si7ROADK07Tz3iBd25on44j",
        "10.2 Geometric Design (part 3)": "1qEahT0gQer3-26ZPXlUbNoHfOoLrgp0f",
        "10.2 Geometric Design (part 4)": "1T5tMvAnCab9DZFia3R7pl176_ypiGEDF",
        "10.3 Drainage System": "1xaJbqbaWl-sryZW1F1BifLGB-FqxKTx7",
        "10.4 Road Pavement": "1JdhujVm9BT2MAmrZJUn_BvqRdDL6y627",
        "10.6 Road Construction Technology": "1oWQjaWNsKmVwBgWPOzzriYhz-QwlzIaH",
        "10.7 Bridge": "1bNgxhrnhUoL-LWliDXtgbwjEqfXscgTD",
        "10.8 Road Maintenance and Repair": "1NOuf2QMxOXPiAl60UJR08WmfZ8anFYYW",
        "10.9 Tracks and Trails": "1c0VeC-o8BQ9eOWlm_4n0SYQ-hW_wWHWv",
        "UNCLASSIFIED Unclassified questions (part 1)": "1Wpr9FJ1fXWmZxXkclRAJeJsThQb8a9Tv",
        "UNCLASSIFIED Unclassified questions (part 2)": "1-aqOrfcTBSjnPXH2eLMZBZrQcrk7Q3kb",
        "UNCLASSIFIED Unclassified questions (part 3)": "1GUExTa_lQPLpCc6K9tqc1qWhMtyhSxeS",
        "UNCLASSIFIED Unclassified questions (part 4)": "1sTgLp2NcTY5K0aS2SedDnIdOLPaRrd4_",
        "UNCLASSIFIED Unclassified questions (part 5)": "1vXqCxHGtIrVhJMXEv2auxDqC3f5T50yv",
        "UNCLASSIFIED Unclassified questions (part 6)": "1WDJnE6yzF4QQblE9RqUXnQoVFSNp8WbQ"
      }
    },
    "11": {
      "Abhyas": {
        "11.1 General (part 1)": "1ufyaNaVUan8RdlJl05EHOl0x44BhnIDP",
        "11.1 General (part 2)": "17L6kQTXTLUKhWYq3NjNzpDJG8tVacisp",
        "11.2 Rate Analysis": "1L5_e2xOIKTi3o4xZLEs_Q8TiK1p3Ya3T",
        "11.3 Specifications": "1PRQ-DybFH2CWeahpH6Sy3N6Yl0xv7nny",
        "11.4 Valuation (part 1)": "1UR5JlW1wXnxx02-mZjBncnVcZY8aYdoM",
        "11.4 Valuation (part 2)": "1zgUUBFVcmMM9UBYs3pgpJLkexES2EBKH",
        "UNCLASSIFIED Unclassified questions (part 1)": "1jTzBHLLgwo60XP7kajBCBdeoiRvexI3u",
        "UNCLASSIFIED Unclassified questions (part 2)": "1eXGvlls1W8__pAo6mrBFoArlaeo4ObxD",
        "UNCLASSIFIED Unclassified questions (part 3)": "1kc3tpVVv4pNcKrGqpjvap2KUEKi1r_Yg",
        "UNCLASSIFIED Unclassified questions (part 4)": "1yJms0qCSkQm70zUaAs2rQc8RDpCuSIK-",
        "UNCLASSIFIED Unclassified questions (part 5)": "10dHGxevjqjJgYPcbMz1S-4h8YsYMEL2k",
        "UNCLASSIFIED Unclassified questions (part 6)": "1EQHgu_IUo2329ftY9KnvM5yAXAS6UYy2",
        "UNCLASSIFIED Unclassified questions (part 7)": "1qNX1FJtxZzjLUziXhyMAVFNGa61diOKM",
        "UNCLASSIFIED Unclassified questions (part 8)": "1xTJFHEXReA4ryHnuejl6VVPXgV7SAyOn"
      }
    },
    "12": {
      "Abhyas": {
        "12.1 Organization": "10CDeOIL_2K2CdD1-KoY0Dcjx8pkekw91",
        "12.2 Site Management": "1rV5BZa_9p4F9dljYqycqs42FfOZZ4dfZ",
        "12.3 Contract Procedure": "1TREYC7-nmuMvK3Ff_lpL50aPsv99vBmr",
        "12.4 Accounts": "1Jup3-cPIRA1w5Xf-a7wX_clNaLkztEiH",
        "12.5 Planning and Control (part 1)": "1fiZRoyF7E12-2hDhyjHEHChGeZ38tieS",
        "12.5 Planning and Control (part 2)": "1mfYDKaz0965gvJmRGj_gxaGFHG8xvytR",
        "12.5 Planning and Control (part 3)": "17-dL5b57vt2Xy0pdJPt-c9m7w_1c6e1Q",
        "12.5 Planning and Control (part 4)": "1TqMI2Z3a-0ciUlHOCaWSFMnVvHlhVH0e",
        "UNCLASSIFIED Unclassified questions (part 1)": "1pKWWtBZCp0VJCEZutlk0waEzEbaXjOgU",
        "UNCLASSIFIED Unclassified questions (part 2)": "1vrMLXmQKfbvZTC6TM8uoQ1u0SiykS5Zn",
        "UNCLASSIFIED Unclassified questions (part 3)": "17_XWZlxF9-FqzssAUTPHUXVuRyIPVpqq",
        "UNCLASSIFIED Unclassified questions (part 4)": "1RPuSDHwqk_RRJIdpdTfNTUE_d0svKJTj"
      }
    },
    "13": {
      "Abhyas": {
        "13.1 General (part 1)": "1-L9u07cWLJXfZgmu3vu1EDl5c0s6Fvze",
        "13.1 General (part 2)": "1lcxALSkD_Ep6YXK3fhK-jb_hYZpdvW-W",
        "13.1 General (part 3)": "1lkPLcVw_UezOs-0lkoPXCtAKy9kQpF7h",
        "13.1 General (part 4)": "1ZZr3tQZtP4erZmu44W5EC6HiB31BlLgf",
        "13.2 Design (part 1)": "1sGJwW8B_Y0f544Igs4AfFPTA58xiatzo",
        "13.2 Design (part 2)": "1uSWnILnPLJxUi-OPnsXkIN45rAT7OR4K",
        "13.3 Airport Maintenance": "1DWXH2v3yu_AVOQ1S_VFC5NmbwSbTK5zo",
        "UNCLASSIFIED Unclassified questions (part 1)": "1gYguHiKk6osB9SRLtywiXHimnywlyX1a",
        "UNCLASSIFIED Unclassified questions (part 2)": "12DPM6kWM-FoJvcI2XOsY2zLqDGYjvBuM",
        "UNCLASSIFIED Unclassified questions (part 3)": "1iKcW_N46vuVB0RQfMORq0a55BZJSy9Yp",
        "UNCLASSIFIED Unclassified questions (part 4)": "1syIn7dRTbb2cYLDo7kcXLFqTaulc-XxT"
      }
    }
  },
  "level7": {
    "1": {
      "Abhyas": {
        "3.1 CG&MOI": "1XFl2GuG7KWq-csJHQGTgRlOK7PxyJEtI",
        "3.2 STRESS&TORSION (part 1)": "1F8OiOp4X1J3cNxufatwkDHwp-KMhieYO",
        "3.2 STRESS&TORSION (part 2)": "1XpyXcNHmgeTNHQIJc9yIpBv0EHmgkZWG",
        "3.2 STRESS&TORSION (part 3)": "1E3TC7ASsQPhiWnao0MiJxw2M1FKgD8jH",
        "3.2 STRESS&TORSION (part 4)": "1XzzFiqBt0KOl0j0VxvG2ftvl4AKnexeS",
        "3.2 STRESS&TORSION (part 5)": "1937CcXWP8M0ls5WxHLeX4_wrh9IR9OC3",
        "3.3 BEAM&FRAME (part 1)": "19wY10Z1YgnCThz_38tCFwitcqNjkLAKR",
        "3.3 BEAM&FRAME (part 2)": "1rD19VRIO-qN1yXz52R2LQ09XVoaSW6og",
        "3.3 BEAM&FRAME (part 3)": "11SyvOVNHqa1mjAx3j6rDCws3L0jsO-7C",
        "3.3 BEAM&FRAME (part 4)": "1OCjR4vFXdLhlieR8n8zEJyTC0zZHYJCt",
        "3.4 DETERMINATE STR (part 1)": "1pNkPBXvheqat7BDi1LxeoiN8R0AT_Xrr",
        "3.4 DETERMINATE STR (part 2)": "1uLZshiv_OJ8Z23UsDOjbZtMjp4xPoX3i",
        "3.5 INDETERMINATE STR (part 1)": "1Lm_O3az5rvNPZS0q5cotL29qGIygPbrQ",
        "3.5 INDETERMINATE STR (part 2)": "1h8m7DmxejiwsKL9ch9ze0CwCxkk01sYq",
        "3.6 PLASTIC ANALYSIS": "1S8cMUFq5L6yk5BK4w3CaUvQQNL3kTpdB",
        "UNCLASSIFIED Unclassified questions (part 1)": "17XHPbdUtlYGT7DyTuB0yLcdJ_e7coa3i",
        "UNCLASSIFIED Unclassified questions (part 2)": "1EaSeQnDPoGrDlJP0lGk_f4upHRZNCInR",
        "UNCLASSIFIED Unclassified questions (part 3)": "1YYXqRHcCHdQgCGJuGRL5FsWw4t1CoGJk",
        "UNCLASSIFIED Unclassified questions (part 4)": "1nSv2Fr8Gy3S5ZoGQ3mxIho8xjudJySRF"
      }
    },
    "2": {
      "Abhyas": {
        "4.1 INTRO&CLASSIFICATION": "1wiNTbloogCwobm_9ijdXToSOEeialTAE",
        "4.10 CURVES": "1en5GuPB7GRuG4wUna1a7IVR4eL24sWNU",
        "4.11 AREA&VOLUME": "1hWK7HYhnnjxY5AUXSqRX6-oxnBeBsfjb",
        "4.2 LINEAR MEASUREMENT": "1l98-MFQGn2kRf9sSNo9qnZD-ZS39OLe0",
        "4.3 COMPASS (part 1)": "1xJu1Xnv038eoExBh5KGh6JGuX0O5IcOQ",
        "4.3 COMPASS (part 2)": "1abyEyVGArmYjhUV_QEnu0wCnMT-hbAYG",
        "4.4 PLANE TABLE (part 1)": "140F_FVggZ50a-TlLnG2xpI0OFpmFQ2No",
        "4.4 PLANE TABLE (part 2)": "1_DrNBqTIqJkAe_UvbVgUMciQkH_0qIXT",
        "4.5 LEVELING (part 1)": "1OcrME8Yf-PNNYHaE2iyBJi1bz18rVetC",
        "4.5 LEVELING (part 2)": "1-9bAY8aemkclCObhoh8iKi4Z_ISnWATO",
        "4.5 LEVELING (part 3)": "11kgh70itdxGn_VhL-NKeqh8ZWOhoAeHU",
        "4.5 LEVELING (part 4)": "16tJIyCWefYy20C728U7nkn9wLNPtZTXA",
        "4.6 CONTOURING": "19IAd3kgbUmsILKJ8O-1mDAPQ6cCzKvXi",
        "4.7 THEODOLITE TRAVERSE (part 1)": "1S4FySJNshVxegARAPBueomEJufppWc_u",
        "4.7 THEODOLITE TRAVERSE (part 2)": "1E2CFOyIrCFYlJkSJ81l5QQl4NO-TNXyn",
        "4.8 TACHEOMETRY": "1cBIIzonwzMMGCuWPyJLMZdlPw5AQOnWn",
        "4.9 TOTAL STATION": "1xk0gIESlCSnKBsQgegfNhthXJsNZ5enz",
        "UNCLASSIFIED Unclassified questions": "1FRrvUGIWtuW6BgsOAm_HJAfAXpumeIBR"
      }
    },
    "3": {
      "Abhyas": {
        "5.1 MATERIAL PROPERTIES": "1ggPLMgIgaSfL5FEssRXCJRWoINLPkyHk",
        "5.2 STONES (part 1)": "117JomcMijVr64a0FEMLa81hcQD89FlW8",
        "5.2 STONES (part 2)": "1pb6OUOz08ai1E12OPDHpUuClMEV7P-XL",
        "5.2 STONES (part 3)": "1aQsxp8i387PBYSs73Vawqad-GJ0DCNMk",
        "5.3 CERAMIC MATERIALS (part 1)": "1iMkuiVUkmOJaIEiQwBe1nu37TbdoVTBj",
        "5.3 CERAMIC MATERIALS (part 2)": "1ie_L7uMuF5X0pPKigWbM1t_metMsnxiI",
        "5.3 CERAMIC MATERIALS (part 3)": "11IBfsxmRHXxjn1DQF0GnOGn5p0Mq7zZd",
        "5.4 CEMENTING MATERIALS (part 1)": "1XRYWqm8tG0nlECNX_RKlEB9szzLWm470",
        "5.4 CEMENTING MATERIALS (part 2)": "1LjBvxSkA3aQelhlTqM_6iX4SaKpBRWGJ",
        "5.4 CEMENTING MATERIALS (part 3)": "1PQIZp2qR4N_pPpjcAlnCWxizwZgVazLB",
        "5.4 CEMENTING MATERIALS (part 4)": "1oQYOusWcXGsYbhtRop7Gn9uLXhCa_fOi",
        "5.5 METALS (part 1)": "1FbmYM1ZEGllfgUcSiT-xyMp0J4NvQfVz",
        "5.5 METALS (part 2)": "11c-NeBvuBVFwmh8NsAzF9qchAA30kN_T",
        "5.6 TIMBER&WOOD (part 1)": "1KMzUcwMHbQp7QiJzVAwS2ax_CkcHYZaz",
        "5.6 TIMBER&WOOD (part 2)": "1MLdnbrXO1Q2WS1KML_CMfl4Lbg3_PsV6",
        "5.7 MISC MATERIALS (part 1)": "1X51TpbokX40KGU0T6N8qioUkrYvEr0RH",
        "5.7 MISC MATERIALS (part 2)": "1amamCIqiJGylnkx6cczVlNbkjCacDn0h",
        "5.7 MISC MATERIALS (part 3)": "1bTNZevz-1wJ1s15iQKEbmCwFmLrL046m",
        "5.7 MISC MATERIALS (part 4)": "18w2EYU7O-Ox-HYpqDfHgFHHftmIpICCT",
        "5.8 SOIL PROPERTIES": "1b0c2qTtR5Wj7OTUKrqO386Hiffg_y1V3",
        "5.9 LOCAL&MODERN MAT": "1xvF8KzRkevYKAputJBnW9T-Hoo-Xo691",
        "UNCLASSIFIED Unclassified questions": "17GwQCvxAbIx77KDMRP7sshHX9INQJ9Ut"
      }
    },
    "4": {
      "Abhyas": {
        "6.1 CONCRETE CONSTITUENTS (part 1)": "1eqL9LYEHQN2ZUvAQEMnY4bsBuyAxk5to",
        "6.1 CONCRETE CONSTITUENTS (part 2)": "14GuWUWUdMlmdhROkttLGnbkYXHExFJfT",
        "6.1 CONCRETE CONSTITUENTS (part 3)": "1GEHKlG2X0YJ3mqma8gjARZzmNXCisvXy",
        "6.1 CONCRETE CONSTITUENTS (part 4)": "1REnXGKQaB86akhP4W6gdrkvEwlhJckoy",
        "6.1 CONCRETE CONSTITUENTS (part 5)": "1lpLrLuAiWZErwEDzSlVizjE8xwV8ynpJ",
        "6.1 CONCRETE CONSTITUENTS (part 6)": "1LkTyJkobvRaxrVPDe1KdlN5UAg8yxJia",
        "6.2 W-C RATIO (part 1)": "1weyAdacF8z34Yya8zsgqLnm48_Vcjt_1",
        "6.2 W-C RATIO (part 2)": "1BzjJoTtuls5DsthKlsySXAgDF5i4ZGY2",
        "6.3 GRADE&MIX DESIGN (part 1)": "1Wm2iw9AWyzZopHBxS57pBcDh5EaSZKsJ",
        "6.3 GRADE&MIX DESIGN (part 2)": "1UWa4rGpnNHuD4ZhVBjIztKfFkVka36ZB",
        "6.4 MIXING&CURING (part 1)": "1YpIV_3S0GTc5t96GX4masX3V4nCESLFF",
        "6.4 MIXING&CURING (part 2)": "13bZG9LlGpVIA9cbkiGMG_RFnDJ1eDozA",
        "6.4 MIXING&CURING (part 3)": "1TzN4mHWyb67xIyrpljf0ecVCirELx9Yc",
        "6.5 ADMIXTURES": "1truBhwnl0TVGeHIi8R1-N2M8CC667l6e",
        "6.6 HIGH STRENGTH CONC": "1OHrq75LdBNFO7V-0yoYeaDgngAlIdBeV",
        "6.7 PRESTRESSED CONC (sorted)": "1hK0SHHzioJuijXiz4r2ws2F2uZPGcar0",
        "UNCLASSIFIED Unclassified questions (part 1)": "1W9gYqBmq3S7fO4b7oWAkntdLvzKcXVkN",
        "UNCLASSIFIED Unclassified questions (part 2)": "1DvlSMUzTbUuw8JGwrXsVERIimKPwgTS8"
      }
    },
    "5": {
      "Abhyas": {
        "7.1 SOIL FORMATION": "1IX0QhTrbyINKRqD99SEh9vmphDZ_kfe-",
        "7.2 3-PHASE SOIL (part 1)": "1mHGNxXiZdTbwA9i3E7--ZI1h8XwMNEot",
        "7.2 3-PHASE SOIL (part 2)": "1qE8AFEttq7P-vsEUfNZ5R_q2eYPbWgJQ",
        "7.3 WATER IN SOIL": "1DZi0XdPzmy7mf7CUVxDn2u5Gtw6ApJK3",
        "7.4 INDEX PROPERTIES (part 1)": "15DRO5T4UnKz8fn3HS1ToAoiEh2XKJSkO",
        "7.4 INDEX PROPERTIES (part 2)": "1F8PV0aVTyMcZgUVrwaz0vd_Lx1ZCFC_u",
        "7.5 ROCK&EARTHQUAKE": "1RO1M1rXP0vklBs-flj1Nrsc-4ftlTf1W",
        "7.6 TUNNELING (part 1)": "1_xZZ-962-ah2O9hxZ0wnTEkD40PInM4V",
        "7.6 TUNNELING (part 2)": "1xYq-gfjY8_gQ0eMbs2zxlgXFAJfAOILY",
        "UNCLASSIFIED Unclassified questions (part 1)": "1LfPGiW6d1DEnDIRjNazxbe8JCIAgfWH7",
        "UNCLASSIFIED Unclassified questions (part 2)": "1cqJucIeHJY93jB5QYxd-FTJoIbx_WkXA"
      }
    },
    "6": {
      "Abhyas": {
        "8.1 SCHEDULING&PLANNING (part 1)": "1Mr8ymW0xC2l8PSAg-hMQjpNkzHNh6s-k",
        "8.1 SCHEDULING&PLANNING (part 2)": "1CQxpVyHx6mdDFzzyI9WbNvN2g4vsENJO",
        "8.1 SCHEDULING&PLANNING (part 3)": "1SnUb3plKG5fF5QS4QxtVZPC3Nv0GLdov",
        "8.1 SCHEDULING&PLANNING (part 4)": "1LfljtlCl2E7T6_qJV3KMHrezp5Zi0dYa",
        "8.1 SCHEDULING&PLANNING (part 5)": "1cPR98LNs6Wb50lst0FK_Mo65s0KIXmey",
        "8.1 SCHEDULING&PLANNING (part 6)": "11ngeMKIyPR6rclNcUAJiANsYLRNmmgM1",
        "8.1 SCHEDULING&PLANNING (part 7)": "1iLBpLIgalBlkAoDlvBh77rvwUXJxgidJ",
        "8.2 CONTRACTUAL PROCEDURE (part 1)": "149qAuaYAptVU8yHF3TtzABjF4ri0eeqT",
        "8.2 CONTRACTUAL PROCEDURE (part 2)": "1kVYIm2F3Nse7Hb3I8D2g0Og7j9o4O9fg",
        "8.2 CONTRACTUAL PROCEDURE (part 3)": "1sLDfskbwZdQJoYxEyYJoF3X4N7BINB0r",
        "8.3 MATERIAL MGMT": "1SnR_KbZWE9YDCHHb83gWOTBmyvnByL5L",
        "8.4 COST QUALITY TIME": "1zFsr77LezhFXj6HCzWOhmxVWr-LA6261",
        "8.5 PROJECT MGMT (part 1)": "1VW6Lp60a7IyU1I5t6GmI7wJJt7KqJKUL",
        "8.5 PROJECT MGMT (part 2)": "1qJ2xA4JMOwgQJk2oYI9tIW-sh01dzDAo",
        "8.6 HEALTH&SAFETY": "17lmjAUBg_JUV6KMBAlvtpXYLVtxXhBUw",
        "8.7 MONITORING&EVAL": "164NQqouT4zcIZKJPdmFLpfZj2476GKbz",
        "8.8 QA PLAN": "1fm6biDeGkrgZnm2axTIUWtt8pJkgzedj",
        "8.9 VARIATION&ALTERATION": "1CbLU9kCdN3pXb_FC6v8tleyz9MjuExwz",
        "UNCLASSIFIED Unclassified questions": "1N72rleYcSglTt8PrlbjN1FSSMgtynUU-"
      }
    },
    "7": {
      "Abhyas": {
        "9.1 TYPES OF ESTIMATES (part 1)": "1zmWe4OL0rQ37WsSCyc5XbYkTJYvKYblZ",
        "9.1 TYPES OF ESTIMATES (part 2)": "1k6P60xOkZ1vps2jukZ__F33-N9BYPqCq",
        "9.2 QUANTITY CALC (part 1)": "16Wib3sKVHrFWU2dDf9WD0LGeD7VFH_Ro",
        "9.2 QUANTITY CALC (part 2)": "1VLF0UPqiXLmFGTjoVY5DT4mp8399aA27",
        "9.2 QUANTITY CALC (part 3)": "1AS3B9gWz7BkLSYKqdDqp6dMYJeoVadtE",
        "9.2 QUANTITY CALC (part 4)": "1e-PwCSbmrKRYluopS25ZoYtD7K7e6vU7",
        "9.2 QUANTITY CALC (part 5)": "1-VNui11txE_dMk_NimXopr3UadnnL9hz",
        "9.3 RATE ANALYSIS (part 1)": "1SjRmA-9ljxPYlEAdWvCWEt24m6yQqWVd",
        "9.3 RATE ANALYSIS (part 2)": "1YpRKN2xEafcnE6gqiSJFn62KJNNNY9MW",
        "9.4 BOQ": "17zYCkZUAlQDCl2goS8TMahb_nxGvXi4m",
        "9.5 SPECIFICATION (part 1)": "1CnonOWc2KMSwb0x4UncfO7Lr984di218",
        "9.5 SPECIFICATION (part 2)": "1IQSeVxC8jbiq45-EHjrfKDuvhZ-PHULd",
        "9.6 VALUATION (part 1)": "1frSNHIeKJ6TsPPoBzWW9tDFdJ9zVI86l",
        "9.6 VALUATION (part 2)": "1PspPhGTcMLT5w2dF-agutPJvGs-eSbRd",
        "UNCLASSIFIED Unclassified questions": "1C91xLjHM5YE13Ro8YuBR5Cd8K_U6HoJL"
      }
    },
    "8": {
      "Abhyas": {
        "10.1 DRAWING SHEET": "1sT5yFX_tJjLVbapKIHLEf8pjQKZ4773z",
        "10.2 SCALES&SITE PLANS": "1w8iFZF3W1-K3DovCVba4OACOI_Ck-iHq",
        "10.3 PROJECTION THEORY (part 1)": "1k6iGbKxJuDcUlhLzn5ybLMREal379eUH",
        "10.3 PROJECTION THEORY (part 2)": "1cu2MjztO8LkN0OqjrL4vw8OQCmyfGlxS",
        "10.3 PROJECTION THEORY (part 3)": "1BT_TtAA3e7pNTr-EQKktSWv65p4G0VVN",
        "10.4 DRAFTING TOOLS (part 1)": "1R8OOzAvUvybHF27np6P4DeKz02EkBg4K",
        "10.4 DRAFTING TOOLS (part 2)": "1gzEVdSWG27Ti37q6_1ZW2ttRPx_AsdvU",
        "10.5 DRAFTING CONVENTIONS": "1FkIk2uLU26KpcSBRUEzcEEhR98CuMCNH",
        "10.6 TOPO&SERVICE DWG": "1pSdSzQcL_sJfLx6hKaWbOaGgvg_Dbzz0",
        "10.7 FREEHAND DRAWING": "13-spjrkMpLX_9NJQhCJ4GDdWw5jECwOP",
        "UNCLASSIFIED Unclassified questions (part 1)": "1Ts5hZywGuXjuAkHN-fUcfj5Xe2xIyCYp",
        "UNCLASSIFIED Unclassified questions (part 2)": "1xeFMevs_l4eZd13ZOrRdnYi8QL1RNaU-",
        "UNCLASSIFIED Unclassified questions (part 3)": "1t5ZSLBwwBkVp6z8Xcnjh53tZlefcyxAw"
      }
    },
    "9": {
      "Abhyas": {
        "11.1 INTEREST&TIME VALUE": "1MGuTXQ-qP2G0Z1E001t-saDzfAAzrFrP",
        "11.2 ANNUITIES&SINKING FUND": "1n4NfhtCbrCjH1iHRhjaapZ27c6V_K_Ev",
        "11.3 NPV IRR WORTH METHODS (part 1)": "1Znmkrn_ow29ZkgUz6noZz75IDlzM1hRK",
        "11.3 NPV IRR WORTH METHODS (part 2)": "18g6KPp0OTox14-637A-m6eOyqybrdihy",
        "11.4 COST CONCEPTS": "10yjV0wziatz_866cellSTWsXKQSQSaUt",
        "11.5 BREAKEVEN&SENSITIVITY": "1zifB3_TU5X5UB9JCEe0MR7gvoHPdOq8v",
        "11.6 ECONOMICS BASICS": "1dlAwzYRLMbePRP5N7Q1RaDLOce0ftQE1",
        "UNCLASSIFIED Unclassified questions": "1RP4UUrmCKWtGolgzghwsG80_FN7qdkuc"
      }
    },
    "10": {
      "Abhyas": {
        "12.1 ETHICS&INTEGRITY": "1cDqsWmher7WccGChIMQt40ZuT86Se6ZC",
        "12.2 NEC ACT (part 1)": "1qPvXAabXx_0sC8Ps6Fgnsvx5igK5qESg",
        "12.2 NEC ACT (part 2)": "1aiITtBW-s95O81_ZlvkAhAHxEIHLbw9f",
        "12.3 CLIENT&CONTRACTOR REL": "1fsxIIdUEMjgVR78mYJAtHPe7HHzq3yaH",
        "12.4 PUBLIC PROCUREMENT": "1w6ZKJJ7GaqW6GpdmasYhTphMZ7l5Q7x_",
        "12.5 NBC": "1uHrNq4bscyX_xzIjOHdXtdMhwysxrKcy",
        "12.6 BUILDING BYLAWS": "1joL3r2x9q5TBg0hAhu-9HkvGhezeMdWi",
        "UNCLASSIFIED Unclassified questions": "1iYa4ouvbAoYt4c1fMvZLAhc8s7e-5RsP"
      }
    }
  }
};

/* ══════════════════════════════════════════════════════════════════════
   CHAPTERDATA — accessor API used by app.js / objective.js / admin.html
   ══════════════════════════════════════════════════════════════════════ */
(function(){
'use strict';

function _levels(){
  return Object.keys(LEVEL_LABELS);
}

function levelLabel(lv){
  return LEVEL_LABELS[lv] || lv;
}

function chapters(lv){
  return CH_NAMES[lv] || {};
}

function chapterName(lv, ch){
  return (CH_NAMES[lv] && CH_NAMES[lv][String(ch)]) || `Chapter ${ch}`;
}

function books(lv, ch){
  return (DRIVE[lv] && DRIVE[lv][String(ch)]) || {};
}

function files(lv, ch, book){
  const b = books(lv, ch);
  return b[book] || {};
}

/* Flat refs for one chapter. Skips null/empty fileIds so callers can
   treat the return value as "ready to fetch". */
function chapterFileRefs(lv, ch){
  const out = [];
  const chBooks = books(lv, ch);
  const chLabel = chapterName(lv, ch);
  Object.keys(chBooks).forEach(book => {
    const subs = chBooks[book] || {};
    Object.keys(subs).forEach(subtopic => {
      const fid = subs[subtopic];
      if (!fid) return;
      out.push({
        lv: String(lv),
        ch: String(ch),
        book,
        subtopic,
        fid: String(fid),
        key: `${lv}_${ch}_${book}_${subtopic}`,
        name: `${chLabel} — ${book} — ${subtopic}`
      });
    });
  });
  return out;
}

/* Flat refs across every level/chapter. This is what `QUIZ.daily()`,
   `QUIZ.adaptive()`, `CACHE.autoSync()`, and the psycho-mode mixer
   iterate over. */
function allFileRefs(){
  const out = [];
  _levels().forEach(lv => {
    const chs = CH_NAMES[lv] || {};
    Object.keys(chs).forEach(ch => {
      out.push(...chapterFileRefs(lv, ch));
    });
  });
  return out;
}

/* Count non-null fileIds for a scope. Used by ON.onLv/onCh to gate
   "(coming soon)" labels on the dropdowns. */
function fileCount(lv, ch, book){
  if (!lv){
    let total = 0;
    _levels().forEach(l => {
      const chs = CH_NAMES[l] || {};
      Object.keys(chs).forEach(c => { total += chapterFileRefs(l, c).length; });
    });
    return total;
  }
  if (!ch){
    let total = 0;
    const chs = CH_NAMES[lv] || {};
    Object.keys(chs).forEach(c => { total += chapterFileRefs(lv, c).length; });
    return total;
  }
  if (!book) return chapterFileRefs(lv, ch).length;
  const subs = files(lv, ch, book) || {};
  return Object.values(subs).filter(Boolean).length;
}

if (typeof window !== 'undefined') {
  // Preserve the raw objects other code might expect directly.
  window.CH_NAMES = CH_NAMES;
  window.LEVEL_LABELS = LEVEL_LABELS;
  window.DRIVE = DRIVE;

  // Public API used by app.js / objective.js / admin.html.
  window.ChapterData = {
    levels: _levels,
    levelLabel,
    chapters,
    chapterName,
    books,
    files,
    chapterFileRefs,
    allFileRefs,
    fileCount
  };
}

})();