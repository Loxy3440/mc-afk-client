# MC AFK Client

Java Edition için izinli Minecraft sunucularında kullanılmak üzere web kontrol paneli ve Mineflayer istemci başlangıç projesi.

## Özellikler

- Web panelinden botu başlatma ve durdurma; bağlantı durumu ve son hata bilgisi.
- Bağlantı koparsa artan bekleme süresiyle otomatik yeniden bağlanma.
- Sunucu, port, Minecraft sürümü, kullanıcı adı ve kimlik doğrulama modunu panelden ayarlama.
- İsteğe bağlı otomatik /login komutu ve düzenli otomatik mesaj.
- Trade için sunucuya özel komutu yapılandırıp paneldeki düğmeyle elle gönderme.
- Panel HTTP Basic Auth ile korunur. Parolalar ve hesap kimlik bilgileri repoya yazılmaz.

Bu panel gerçek Minecraft 3D görüntüsü sunmaz; bir Minecraft istemcisi gibi sunucuya bağlanan botun durumunu gösterir ve kontrol eder. Trade protokolü sunucuya/plugin'e göre değiştiği için başlangıç sürümü yalnızca senin tanımladığın komutu elle gönderir; otomatik envanter işlemi yapmaz.

## Yerel çalıştırma

1. Node.js 20 veya üstünü yükle.
2. npm install çalıştır.
3. .env.example dosyasını .env olarak kopyala.
4. DASHBOARD_PASSWORD değerini uzun ve benzersiz bir parola ile doldur. En az 16 karakter olmalı.
5. Sunucu adresi ve Minecraft kullanıcı bilgilerini ayarla. Microsoft hesabı için MC_AUTH_MODE=microsoft; yalnızca izinli offline-mode sunucusu için MC_AUTH_MODE=offline kullan.
6. npm start çalıştır ve http://localhost:3000 adresini aç. Tarayıcı kimlik doğrulama penceresinde kullanıcı adı admin, parola ise DASHBOARD_PASSWORD değeridir.

Replit'te .env dosyası yerine Secrets kullan. Secret isimleri: DASHBOARD_PASSWORD ve gerekliyse MC_LOGIN_PASSWORD. Diğer bağlantı değerleri panelde kaydedilebilir. MC_LOGIN_PASSWORD yalnızca sunucunun /login komutu için gerekir; Minecraft/Microsoft hesap parolası değildir. Microsoft oturum açma akışı ilk bağlantıda Replit konsolunda gösterilebilir; oturum önbelleği .minecraft-auth klasöründe tutulur.

## Panel ayarları

Panelde düzenlenen gizli olmayan ayarlar config.json dosyasına kaydedilir. Bu dosya .gitignore içindedir ve GitHub'a gönderilmez. MC_LOGIN_PASSWORD ve DASHBOARD_PASSWORD hiçbir API yanıtında gösterilmez.

Otomatik giriş için Secrets içinde MC_LOGIN_PASSWORD tanımla, panelde otomatik girişi etkinleştir ve komutu /login {password} biçiminde bırak. Otomatik mesajın aralığı en az 30 saniyedir. Trade komutu yalnızca düğmeye basıldığında gönderilir.

## Replit dağıtımı

Botun bağlantıda kalması için sürekli çalışan bir sunucu süreci/always-on dağıtım gerekir. Dağıtım ortamında PORT otomatik kullanılır; DASHBOARD_PASSWORD ve gerekli MC_LOGIN_PASSWORD değerlerini Replit Secrets'a ekle. Dağıtım dosya sistemi geçici olabileceğinden panel ayarlarını kalıcı tutmak için kalıcı depolama eklenmesi gerekebilir.

## Güvenli kullanım

Yalnızca bot kullanımına açıkça izin veren sunucularda çalıştır. Sunucunun kurallarına uy; anti-cheat, AFK kısıtlaması veya erişim kontrollerini atlatmaya yönelik özellik yoktur. Şifreleri .env, config.json, ekran görüntüsü veya GitHub'a koyma.

## Kontroller

- npm test
- npm run check
