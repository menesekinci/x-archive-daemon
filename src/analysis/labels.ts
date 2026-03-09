import type { AnalysisLabelRecord } from "../provider-types.js";

export const ANALYSIS_VERSION = "2026-03-09-v1";

function defineLabel(
  label: string,
  titleTr: string,
  descriptionTr: string,
  aliases: string[],
  seedExamples: string[]
): AnalysisLabelRecord {
  return {
    label,
    titleTr,
    descriptionTr,
    aliases,
    seedExamples
  };
}

export const analysisLabels: AnalysisLabelRecord[] = [
  defineLabel(
    "software_architecture",
    "Yazilim Mimarisi",
    "Yazilim sistemlerinin genel tasarimi, katmanlanmasi, servis sinirlari, modulerlik ve buyume stratejileriyle ilgili ogretici icerikler.",
    ["architecture", "mimari", "system design", "yazilim mimarisi"],
    ["Monolith mi microservice mi?", "Bir sistemi katmanlara nasil ayirirsin?"]
  ),
  defineLabel(
    "monolith_vs_microservices",
    "Monolith ve Microservice",
    "Monolith ile microservice arasindaki trade-off'lar, erken microservice gecisinin riskleri ve hangi durumda hangi yapinin daha saglikli olduguyla ilgili ogretici paylasimlar.",
    ["monolith", "microservices", "mikroservis", "moduler monolith"],
    ["Cogu proje icin monolith daha basittir.", "Microservice'e erken gecme."]
  ),
  defineLabel(
    "backend_api",
    "Backend ve API",
    "Backend gelistirme, servis mantigi, endpoint tasarimi, is kurallari, request-response akisi ve sunucu tarafli uygulama gelistirme ile ilgili icerikler.",
    ["backend", "api", "rest", "endpoint", "server"],
    ["API tasarimi yaparken nelere dikkat edilir?", "Backend servis katmani nasil kurulur?"]
  ),
  defineLabel(
    "database_sql",
    "Veritabani ve SQL",
    "Veritabani secimi, SQL sorgulari, tablo tasarimi, veri erisimi ve veriyi dogru modelleme hakkinda ogretici paylasimlar.",
    ["sql", "database", "postgres", "mysql", "veritabani"],
    ["SQL sorgu optimizasyonu", "Veritabani tasarimi nasil yapilir?"]
  ),
  defineLabel(
    "database_indexing",
    "Index ve Sorgu Performansi",
    "Index tasarimi, sorgu planlari, yavas sorgular, veritabani performansi ve sorgu iyilestirme ile ilgili ogretici notlar.",
    ["index", "query plan", "slow query", "btree", "execution plan"],
    ["Index yanlis yerde ise faydadan cok zarar getirir."]
  ),
  defineLabel(
    "orm_data_access",
    "ORM ve Veri Erisimi",
    "ORM kullanimi, repository katmani, veri erisim desenleri ve ORM kaynakli performans ya da soyutlama problemleriyle ilgili icerikler.",
    ["orm", "prisma", "typeorm", "hibernate", "repository pattern"],
    ["ORM rahatlik saglar ama sorguyu gormeyi unutturma."]
  ),
  defineLabel(
    "transactions_consistency",
    "Transaction ve Tutarlilik",
    "Transaction yonetimi, veri tutarliligi, race condition, idempotency ve state butunlugu ile ilgili ogretici paylasimlar.",
    ["transaction", "consistency", "idempotency", "race condition"],
    ["Odeme islerinde transaction sinirlari dogru kurulmalidir."]
  ),
  defineLabel(
    "caching",
    "Onbellekleme",
    "Cache tasarimi, cache invalidation, Redis kullanimi, read throughput ve gecikme azaltma ile ilgili teknik paylasimlar.",
    ["cache", "caching", "redis", "ttl", "cache invalidation"],
    ["Cache invalidation niye zordur?", "Redis ne zaman gerekir?"]
  ),
  defineLabel(
    "performance_scaling",
    "Performans ve Olcekleme",
    "Performans darboğazlari, latency, throughput, yatay buyume, darboğaz analizi ve sistem kapasitesini arttirma ile ilgili icerikler.",
    ["performance", "scaling", "latency", "throughput", "bottleneck"],
    ["Yavaslayan sistemi nasil olceklersin?", "Ilk darboğaz nerede aranir?"]
  ),
  defineLabel(
    "distributed_systems",
    "Dagitik Sistemler",
    "Birden cok servis, ag hatalari, bagimlilik kopmasi, kisitli baglanti ortamlari ve dagitik sistemlerde hata yonetimi ile ilgili paylasimlar.",
    ["distributed systems", "network partition", "timeout", "dagitik sistemler"],
    ["Bagimlilik cokerse sistem nasil davranmali?"]
  ),
  defineLabel(
    "messaging_queues",
    "Mesajlasma ve Kuyruklar",
    "Queue, event bus, Kafka, RabbitMQ, background job ve asenkron veri akislari ile ilgili teknik paylasimlar.",
    ["queue", "kafka", "rabbitmq", "job", "background worker"],
    ["Kuyruk ne zaman gerekir?", "Asenkron islem neden kullanilir?"]
  ),
  defineLabel(
    "event_driven_design",
    "Event Driven Tasarim",
    "Event tabanli sistemler, publish-subscribe, eventual consistency ve event sourcinge yakin mimari kararlar hakkinda paylasimlar.",
    ["event driven", "pubsub", "event sourcing", "eventual consistency"],
    ["Her seyi event yapmak neden yanlis olabilir?"]
  ),
  defineLabel(
    "concurrency_async",
    "Eszamanlilik ve Asenkron Isleme",
    "Asenkron kod, concurrency, thread, worker, non-blocking akis ve is parcalama ile ilgili ogretici icerikler.",
    ["async", "await", "concurrency", "thread", "worker"],
    ["Async kullanmak her zaman hiz demek degildir."]
  ),
  defineLabel(
    "testing_qa",
    "Test ve Kalite",
    "Test kulturü, kalite kontrol, regressions, guvenli degisiklik ve genel test stratejisi ile ilgili teknik icerikler.",
    ["testing", "qa", "regression", "quality", "test strategy"],
    ["Kod degisikligi yaparken once hangi test lazim?"]
  ),
  defineLabel(
    "unit_testing",
    "Unit Test",
    "Kucuk kod parcaciklarini yalitimli test etme, unit test sinirlari, mock kullanimi ve unit test dogrulugu ile ilgili ogretici notlar.",
    ["unit test", "mock", "stub", "isolated test"],
    ["Her seyi mocklamak neden kotu olabilir?"]
  ),
  defineLabel(
    "integration_testing",
    "Entegrasyon Testi",
    "Gercek bilesenlerin birlikte calistigi testler, API, DB, queue, servis integrasyonlari ve bunlarin guvenli sekilde test edilmesiyle ilgili icerikler.",
    ["integration test", "contract test", "e2e", "api test"],
    ["Unit test yetmez; entegrasyon testi ne zaman gerekir?"]
  ),
  defineLabel(
    "refactoring",
    "Refactor",
    "Kodun dis davranisini bozmadan yapisini iyilestirme, teknik borcu azaltma ve guvenli refactor stratejileri ile ilgili icerikler.",
    ["refactor", "teknik borc", "code cleanup"],
    ["Refactor ederken davranisi kirma."]
  ),
  defineLabel(
    "clean_code",
    "Temiz Kod",
    "Okunabilirlik, isimlendirme, sorumluluk ayirimi, basitlik ve kodun insan tarafindan anlasilabilir olmasi ile ilgili teknik paylasimlar.",
    ["clean code", "readability", "naming", "simplicity"],
    ["Kod bilgisayar icin degil ekip icin de okunur olmalidir."]
  ),
  defineLabel(
    "code_review",
    "Kod Inceleme",
    "PR inceleme, davranis riski, test eksigi, backward compatibility ve degisikligin operasyonel etkisi ile ilgili paylasimlar.",
    ["code review", "pr review", "backward compatibility", "migration risk"],
    ["Kod incelerken once hangi risklere bakilir?"]
  ),
  defineLabel(
    "debugging",
    "Hata Ayiklama",
    "Bug bulma, sebep analizi, hipotez kurma, log ve reproduksiyon ile ilgili ogretici icerikler.",
    ["debugging", "bug", "root cause", "reproduce"],
    ["Hata ayiklarken tahmin degil hipotez kur."]
  ),
  defineLabel(
    "incident_response",
    "Incident Yonetimi",
    "Canli problem, servis kesintisi, acil durum yaniti, rollback ve olay sonrasi ders cikarma ile ilgili icerikler.",
    ["incident", "outage", "rollback", "postmortem"],
    ["Sistem patladiginda ilk 10 dakikada ne yaparsin?"]
  ),
  defineLabel(
    "observability",
    "Gozlemlenebilirlik",
    "Metric, trace, log, health check ve sistemi anlamak icin gereken gozlemlenebilirlik katmanlariyla ilgili paylasimlar.",
    ["observability", "metrics", "tracing", "telemetry"],
    ["Olcmedigin seyi duzeltemezsin."]
  ),
  defineLabel(
    "logging_monitoring",
    "Loglama ve Monitoring",
    "Log yapisi, alarm, dashboard, izleme sinyalleri ve uyarilarin gürültü üretmeden calismasi ile ilgili icerikler.",
    ["logging", "monitoring", "alerting", "dashboard"],
    ["Her log faydali log degildir."]
  ),
  defineLabel(
    "security_appsec",
    "Uygulama Guvenligi",
    "Girdi dogrulama, gizli bilgi yonetimi, saldiri yuzeyi, guvenli kodlama ve uygulama guvenligi ile ilgili teknik paylasimlar.",
    ["security", "appsec", "xss", "sqli", "secret management"],
    ["Guvenlik sonradan eklenen bir katman degildir."]
  ),
  defineLabel(
    "authentication_authorization",
    "Kimlik Dogrulama ve Yetkilendirme",
    "Kullanici kimligini dogrulama, rol yetkilendirmesi, token, session ve yetki siniri ile ilgili ogretici icerikler.",
    ["auth", "authentication", "authorization", "jwt", "session", "rbac"],
    ["Auth ile authorization ayni sey degildir."]
  ),
  defineLabel(
    "api_design",
    "API Tasarimi",
    "REST, versioning, endpoint semantigi, error contracts ve istemci-sunucu sozlesmeleri ile ilgili paylasimlar.",
    ["api design", "rest", "graphql", "http contract", "endpoint design"],
    ["API tasarimi sadece URL secmek degildir."]
  ),
  defineLabel(
    "versioning_backward_compatibility",
    "Versiyonlama ve Geriye Uyumluluk",
    "API degisiklikleri, migration riskleri, eski istemcileri kirmama ve geriye uyumlu degisiklik stratejileri ile ilgili ogretici notlar.",
    ["versioning", "backward compatibility", "migration", "breaking change"],
    ["Degisiklik yaparken once neyi kiracagini dusun."]
  ),
  defineLabel(
    "devops_infrastructure",
    "DevOps ve Altyapi",
    "Sunucu, container, network, ortam yonetimi ve altyapi kararlarinin yazilim tarafina etkisi ile ilgili paylasimlar.",
    ["devops", "docker", "kubernetes", "infra", "network"],
    ["Altyapi karari uygulama davranisini dogrudan etkiler."]
  ),
  defineLabel(
    "ci_cd_release",
    "CI CD ve Release",
    "Sürüm cikarma, pipeline, deployment, rollback ve guvenli release sureci ile ilgili ogretici icerikler.",
    ["ci cd", "release", "deployment", "pipeline", "rollback"],
    ["Release sureci kod kadar onemlidir."]
  ),
  defineLabel(
    "cloud_cost",
    "Bulut Maliyeti",
    "Bulut servis maliyeti, gereksiz kaynak tuketimi, verimsiz mimari tercihleri ve maliyet optimizasyonu ile ilgili icerikler.",
    ["cloud cost", "aws bill", "gcp cost", "optimization"],
    ["Olcekleme kadar maliyet de takip edilmelidir."]
  ),
  defineLabel(
    "frontend_web",
    "Frontend ve Web",
    "Tarayici tarafli uygulamalar, web performansi, state yonetimi, UI mimarisi ve frontend gelistirme ile ilgili icerikler.",
    ["frontend", "web", "react", "ui", "state management"],
    ["Frontend de mimari ister."]
  ),
  defineLabel(
    "mobile_engineering",
    "Mobil Muhendislik",
    "Mobil uygulama mimarisi, release sureci, store, cihaz sinirlari ve mobil gelistirme pratikleri ile ilgili paylasimlar.",
    ["mobile", "ios", "android", "app store", "play store"],
    ["Mobilde release sureci kod kadar kritiktir."]
  ),
  defineLabel(
    "product_engineering",
    "Urun Muhendisligi",
    "Teknik kararlarin urun ihtiyaciyla dengelenmesi, kullanici degeri, hiz ve kalite dengesi ile ilgili icerikler.",
    ["product engineering", "trade-off", "user value"],
    ["Dogru teknik karar urun ihtiyacindan bagimsiz degildir."]
  ),
  defineLabel(
    "developer_workflow",
    "Gelistirici Akisi",
    "Gunluk gelistirici pratikleri, task parcasi secimi, repo duzeni, local gelistirme deneyimi ve calisma akisi ile ilgili icerikler.",
    ["workflow", "developer experience", "dx", "repo structure"],
    ["Akis kotuyse ekip hizi duser."]
  ),
  defineLabel(
    "ai_assisted_coding",
    "AI Destekli Kodlama",
    "Yapay zeka ile kod yazma, kod inceleme, prompt tasarimi, insan denetimi ve AI araclarinin guvenli kullanimi ile ilgili paylasimlar.",
    ["ai coding", "copilot", "codex", "llm", "ai assisted coding"],
    ["AI hiz katar ama sorumlulugu devralmaz."]
  ),
  defineLabel(
    "vibe_coding",
    "Vibe Coding",
    "Plansiz ve hizli kod yazma kulturunu daha saglikli hale getirme, kontrol noktasi kurma ve genc gelistiricilere yonelik uyarilarla ilgili icerikler.",
    ["vibe coding", "hizli prototip", "plansiz kod"],
    ["Vibe coding yaparken bile bir sinir ve kontrol gerekir."]
  ),
  defineLabel(
    "prompting_for_engineering",
    "Muhendislik Icin Prompt Yazimi",
    "AI ajanlari ve modellerine teknik is yaptirmak icin net, guvenli ve test edilebilir prompt yazma ile ilgili icerikler.",
    ["prompting", "prompt engineering", "agent prompt"],
    ["Prompt, teknik lider gibi dusunmeye zorlamalidir."]
  ),
  defineLabel(
    "domain_modeling",
    "Alan Modelleme",
    "Is kurallarini nesnelere, tablolara ve servis sinirlarina dogru dagitma; domain kavramlarini temiz modelleme ile ilgili ogretici paylasimlar.",
    ["domain", "domain modeling", "bounded context", "ubiquitous language"],
    ["Yanlis modelleme tum sistemi kirletir."]
  ),
  defineLabel(
    "team_process",
    "Ekip Sureci",
    "Ekip icinde karar alma, teknik tartisma, sorumluluk paylasimi, kod standardi ve surec verimliligi ile ilgili paylasimlar.",
    ["team process", "engineering process", "team workflow"],
    ["Iyi ekip sureci kotu kodu bile azaltir."]
  ),
  defineLabel(
    "technical_decision_making",
    "Teknik Karar Alma",
    "Trade-off analizi, ne zaman basit kalinacagi, ne zaman buyuk yatirim yapilacagi ve teknik karar mantigi ile ilgili icerikler.",
    ["trade-off", "technical decision", "decision making"],
    ["Her teknik secim aslinda bir maliyet kararidir."]
  ),
  defineLabel(
    "startup_engineering",
    "Startup Muhendisligi",
    "Az kaynakla hizli ama kontrollu ilerleme, MVP, kisa vadeli kararlarin orta vadeli etkisi ve startup ortaminda yazilim gelistirme ile ilgili paylasimlar.",
    ["startup engineering", "mvp", "early stage"],
    ["Startup hizli olmalidir ama kör olmamalidir."]
  ),
  defineLabel(
    "mentorship_learning",
    "Mentorluk ve Ogrenme",
    "Genc gelistiricilere tavsiye, nasil ogrenilir, nasil gelisilir ve mesleki ilerleme ile ilgili ogretici paylasimlar.",
    ["mentorship", "learning", "kariyer", "ogrenme"],
    ["Teknik bilgi kadar nasil ogrenecegin de onemlidir."]
  )
];

export const EDUCATIONAL_SIGNAL_PHRASES = [
  "denir",
  "demektir",
  "ornegin",
  "örneğin",
  "ama onemli",
  "ama önemli",
  "cogu durumda",
  "çoğu durumda",
  "gerekmez",
  "gerekir",
  "dikkat et",
  "o yuzden",
  "o yüzden",
  "sebebi",
  "yanlis",
  "yanlış",
  "dogru olan",
  "özetle"
];

export const TECHNICAL_KEYWORDS = [
  "api",
  "backend",
  "frontend",
  "database",
  "sql",
  "postgres",
  "redis",
  "microservice",
  "monolith",
  "auth",
  "authorization",
  "docker",
  "kubernetes",
  "deploy",
  "release",
  "testing",
  "refactor",
  "performance",
  "latency",
  "queue",
  "cache",
  "event",
  "incident",
  "bug",
  "debug",
  "code review",
  "prompt",
  "llm",
  "vibe coding"
];
