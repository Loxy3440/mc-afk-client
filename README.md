# MC AFK Client

Java Edition icin izinli Minecraft sunucularinda kullanilmak uzere hesap bazli web paneli. Her hesap kendi bot oturumuna, ayarlarina ve tarayicida acilan birinci sahis 3D dunyasi goruntusune sahiptir.

## Ne yapar?

- Hesap ekle: gorunen isim, Minecraft kullanici adi/e-posta, sunucu adresi ve oturum turu.
- Her hesap icin ayri sunucu /login sifresi, otomatik mesaj, yeniden baglanma ve manuel trade komutu.
- Hesap kartinin baglantisi o hesabin ayrica goruntulenen oturum sayfasini acar ve botu baslatir.
- Prismarine Viewer, botun gercek sunucu dunyasini tarayicida birinci sahis 3D olarak render eder.

Goruntu tam Mojang Minecraft istemcisi degildir: botun baktigi dunyayi gosterir, klavye ile oyun kontrolu saglamaz. Yalnizca bot kullanimina izin veren sunucularda kullan. AFK/anti-cheat kisitlamalarini atlatan hareket veya gizleme ozelligi yoktur.

## Guvenlik

- Microsoft hesap parolasi web formunda istenmez. Microsoft auth ilk baglantida Mineflayer'in resmi cihaz-kodu akisini kullanir; cihaz kodu Replit konsolunda gorunebilir.
- Formdaki sifre yalnizca sunucunun /login sifresidir ve ACCOUNT_ENCRYPTION_KEY ile AES-256-GCM kullanilarak hesap dosyasinda sifreli saklanir.
- DASHBOARD_PASSWORD paneli HTTP Basic Auth ile korur. ACCOUNT_ENCRYPTION_KEY, DASHBOARD_PASSWORD ve gerekiyorsa VNC_PASSWORD degerlerini Replit Secrets icinde tut; chat'e veya GitHub'a koyma.
- Hesap verileri data/accounts.json dosyasinda saklanir. Bu dosya .gitignore icindedir. Kalici depolama gerektiren dagitimlarda persistent storage ayarla.

## Calistirma

Node.js 20+ gereklidir.

1. npm install
2. .env.example dosyasini .env olarak kopyala.
3. DASHBOARD_PASSWORD icin en az 16 karakterlik benzersiz bir deger, ACCOUNT_ENCRYPTION_KEY icin en az 32 karakterlik rastgele bir deger ayarla.
4. npm start ve http://localhost:3000 adresini ac. Tarayici giris penceresinde kullanici admin, parola DASHBOARD_PASSWORD.

Replit'te .env yerine Secrets kullan. Botlar ve goruntu proxy'si ayni Node surecinde calisir. Yayin ortaminda surekli oturum icin Reserved VM/always-on gerekir; birden cok aktif oturum bellek ve CPU tuketir. VIEWER_PORT_BASE, dahili Prismarine goruntu sunucularinin baslangic portudur.

Microsoft hesabiyla ilk giriste cihaz kodu konsolda gosterilebilir. Sunucuya ait /login sifresi Microsoft parolasi degildir; bunu sadece ilgili hesabin ayarlarina gir.

## Trade

Hesapta trade komutu tanimlanabilir; komut yalnizca hesap sayfasindaki dugmeye basildiginda gonderilir. Envanter otomasyonu sunucu pluginine gore degistigi icin bu baslangic surumunde otomatik trade yoktur.

## Kontroller

- npm test
- npm run check
