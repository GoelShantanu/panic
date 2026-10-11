# News quality review — 10 October 2026 (D-080)

**Scope:** Founder-authorised review of the D-076 held tagging/duplicate cases, hospital names, two semantic challenges, and a fresh independent model review. All changes are local. This report owns the results; project memory owns remaining work.

## Historical cases closed

[VERIFIED] Reviewed all 11 held tag changes. Ten legitimate tag sets are preserved; item82 removes the old Reliance parent mapping, leaves Jio Platforms unresolved and excludes the incidental Hyundai IPO comparison. Known unlisted subjects now block incidental excerpt fallback even before their parent aliases existed. Complete listed names, explicit omitted-stock subjects and roundup completion are preserved.

[VERIFIED] Added ten audited historical alias rows, preserving existing ranges and legal-name/symbol history:

| Bounded publication-date interval, IST | Aliases and ISINs |
| --- | --- |
| `[2026-10-05,2026-10-06)` | Nykaa → INE388Y01029; Shyam Metalics → INE810G01011; Ola Electric → INE0LXG01040; Sterlite Tech → INE089C01029 |
| `[2024-04-23,2024-04-24)` | ICICI Pru Life → INE726G01019; Tata Consumer → INE192A01025; LTIMindtree → INE214T01019; BPCL → INE029A01011; Sun Pharma → INE044A01036; Maruti Suzuki → INE585B01010 |

These dates describe reviewed article days, not brand inception or proven continuity. Items192–196 are April2024 reports first ingested in October2026. First-seen time does not establish freshness. All nine existing tags on item196 remain supported by its [canonical publisher market recap](https://www.moneycontrol.com/news/business/markets/taking-stock-market-fails-to-hold-on-to-days-gains-ends-marginally-higher-12703401.html). The [LTIMindtree FY2023–24 report](https://www.ltimindtree.com/wp-content/uploads/2024/06/Integrated-Annual-Report-FY-2023-24.pdf) supports the historical identity without backdating today's LTM symbol. Other primary issuer sources and exact item IDs are in the evidence files listed below.

[VERIFIED] Added nine hospital aliases: Apollo Hospital effective October7; Max Health, Medanta and Manipal Hospitals effective October9; Apollo, Max, Manipal, Fortis and Yatharth effective October9 as **ambiguous**. Bare names resolve only as members of an explicit hospital stock list with proper boundaries and sector context in the same sentence. Competing tyre/financial/insurance/payment context and multiple-ISIN collisions remain unresolved. Four Apollo live-price items490/498/978/1013 and four hospital roundup items1095/1147/1170/1190 now resolve their reviewed feed-supported issuers. Mixed-sector names conservatively abstain. Complete aliases/flags are in [curated-aliases.csv](../ops/curated-aliases.csv); issuer evidence includes [Apollo's disclosure](https://www.apollohospitals.com/apollo_pdf/Acquisition-of-650-bed-hsopital-facility-Gurgaon-8th-August-2022.pdf), [Fortis's disclosure](https://www.fortishealthcare.com/investor/shareholding%20pattern/fhl%20shareholding%20pattern-december%2031%2C%202025) and [Yatharth's NSE filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_140507_05022026173124_iXBRL_WEB.html).

[INFERRED — separate model publisher review] The five held duplicate pairs and two older semantic challenges have explicit decisions:

| Pair | Decision |
| --- | --- |
| `312:349` | Same October7 market session; merged after all-member check, score0.899064, survivor312, audit1107 |
| `284:368` | Same October7 RBI MPC coverage; merged after all-member check, score0.896855, survivor284, audit1108 |
| `728:730`, `663:728` | Retain separate: multi-company earnings liveblog versus TCS-only results |
| `326:370` | Retain separate: ET's persistent page now reports realized policy/sector reaction while NDTV remains a forecast; distinguish current page from frozen feed |
| `1197:q83538` | Same attributed Nikkei Apple-order report and stock reaction; candidate83538 remains unpublished, so no second live story needs merging |
| `q83247:1316` | Correct the old provisional same-event judgment to different: Friday close versus weekly retrospective/outlook. Preserve old labels and treat this table as an additive erratum |

Full publisher content was accessible for12/13 endpoints; BusinessLine's Friday-close page remained blocked. These cases were not blind because prior scores/labels were visible. Review establishes reported scope/attribution, not the truth of every financial claim.

## Fresh blind review and corrections

[VERIFIED] Captured108 previously unseen headlines first ingested since October10 IST. Independently sampled40 articles without using tags or stored clusters and enriched50 event pairs using lexical similarity plus random pairs. A separate reviewer saw only a sanitised packet, permitted NSE symbols and publisher material. Labels were frozen before scoring; no parser, aliases, predictions or stored clusters were shown to the reviewer.

Publisher main narratives/complete issuer lists were recovered for31/40 sampled articles; nine used partial excerpts. One issuer set remains unknown (item1361); one pair is uncertain (`1355:1409`). Labels contain nine same-event and40 distinct-event pairs. Label SHA256 is `236eb51c6a77e6ea864a7d8dff490c312e196a0e75a9712eae40729b63cca0e8`; snapshot SHA256 is `31b94f5331161d5cfcbfe3540db6787b65f3f187f5065ea2de706c8d92b6bcff`. Read-only labels, per-article/pair evidence and freeze manifest are retained unchanged.

| Measure | Frozen implementation baseline | After reviewed corrections |
| --- | --- | --- |
| Correct / false / missed tags | 19 / 3 / 61 | 22 / 0 / 58 |
| Tag precision on adjudicated emitted tags | 86.36% | 100% |
| Whole-article subject recall | 23.75% | 27.50% |
| Automatically kept off-topic articles | 1 | 0 |
| Incorrect relevance discards | 0 | 0 |
| Model false merges / false splits | 0 / 8 | 0 / 8 |

**Interpretation:** The baseline is blind model evaluation. The final column is regression on the same now-unblinded corpus, not a new independent validation. Whole-article labels include companies absent from short RSS excerpts. A single40-stock portfolio accounts for37 remaining misses; other broad lists contribute further misses. The parent-issuer judgment in Airtel Money coverage and incomplete publisher access require human review. Zero false tags among22 correct emitted tags has only an87.27% one-sided95% lower bound, so this does **not** demonstrate the99.5% precision target.

[VERIFIED] Corrected the three explicit false-tag patterns: a broker that **names stocks to buy** is attribution; **asset management arms of** a coordinated investor list does not make its bank parent the issuer subject; **Premier League** is a sports competition rather than Premier Limited. Genuine broker/bank results, executive appointments and full competing issuer names remain covered by tests. Personal founder profiles quoting a retrospective valuation now go to review unless they include an explicit issuer/corporate event. Reversibly withdrew published biography item1431 with system/model provenance and an audit reason; its original item remains stored.

[VERIFIED] Added exact feed-supported aliases Bharat Petroleum → BPCL/INE029A01011 and Hindustan Petroleum → HINDPETRO/INE094A01015 effective October10, corroborated by [BPCL's NSE filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_INDAS_111023_13082025180457_iXBRL_WEB.html) and [HPCL's NSE filing](https://nsearchives.nseindia.com/corporate/ixbrl/INTEGRATED_FILING_GOVERNANCE_160176_22052026165145_iXBRL_WEB.html). An explicit upcoming corporate-action calendar with multiple named issuers and “and more” may complete its list from the excerpt. Reanalysed four selected fresh stories: removed the incidental SBI/Motilal Oswal tags, added two oil issuers and Anand Rathi Wealth. Repeat preview shows zero changes.

[VERIFIED/INFERRED] Reviewed all nine positive duplicate edges against current story members. They represent four events, including six correlated DMart edges. One OMO edge is already joined; three edges score below0.75 and five DMart edges retain numeric/financial vetoes. Slight publisher differences are not all reconciled as rounding. No additional merges, threshold reductions or veto overrides were applied. These eight misses remain an explicit matching backlog; positive sampling is enriched, so these counts are not population estimates. Stored metrics exclude25 unpublished pairs and show no false merge among15 published distinct-event pairs.

## Preservation, validation and limits

[VERIFIED] Backed up the existing database before each maintenance batch and paused only ingestion/pipeline while applying reviewed changes. Historical maintenance updated14 selected stories/19 analyses, including nine changed item tag sets, and performed two merges. Items1438, comments5, directional votes0, quality votes4 and operator overrides0 were identical before/after the first batch; live stories1113→1111. Fresh maintenance updated four additional selected stories and audited the biography withdrawal. No invented human/operator account or automatic relevance promotion was used. The21 new alias rows comprise ten historical intervals and11 current aliases. Rules version is `rules-2026-10-10.1`.

[VERIFIED] Historical and fresh repeat previews both show zero changes. Merged URLs return301 to surviving stories, which return200. Homepage,50-story stream and SSE return200; stream reports zero stale sources. Ingestion/pipeline were restarted with current rules and existing environment. Web/live/billing services were retained.

[VERIFIED] Separate adversarial review passed eight general and18 hospital probes, followed by the targeted tests. Strict TypeScript and final regression results are recorded in the completion addendum below. The initial full run hit a5-second historical-reanalysis test timeout and then a shared-fixture follow-on failure; the isolated13-test pipeline suite passed. The multi-pass real-PostgreSQL test now has an explicit15-second timeout while preserving all functional assertions, preventing unfinished fixture work leaking into the next case on a loaded Windows host.

**Evidence directory:** ignored `scratch/quality-2026-10-10/` contains historical tag/duplicate reviews, official source URLs, bounded alias supplements, previews/applications/verifications, backups, HTTP checks and adversarial results. Its `fresh/` directory contains immutable labels/evidence/manifest, baseline and reviewed score reports, post-unblinding error/positive-pair reviews, and fresh operational results. Scratch material is local evidence, excluded from Git; this tracked report preserves decisions, counts, hashes and limits.

**Remaining:** Independent human adjudication across fresh dates, sufficient representative precision evidence, full-article versus excerpt recall, the eight new duplicate misses, and complete temporal issuer history remain unresolved. Model reviewers are not human certification. No cloud deployment, live payments, browser-layout acceptance or publication is included. Existing payment changes are preserved; this task's code/doc changes remain uncommitted.

**Completion validation:** [VERIFIED] Final strict TypeScript checks and **571/571 tests across56 files, zero failures/skips**, pass against the task-created disposable PostgreSQL17 server. All functional assertions remain enabled. Final historical/fresh previews, alias activation, frozen-label integrity and local stream checks are recorded in `final-verification.json`. Only the disposable test container is removed after validation; the application database and running services remain. Human reviewers can use the frozen `fresh/independent-packet.json` and source-evidence file without relying on production predictions.
