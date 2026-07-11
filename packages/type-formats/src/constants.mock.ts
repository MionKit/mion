/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// constants using inside runtype params should be declared as types
export type EMAIL_NAME_SAMPLES = [
    // English Names
    'john.doe',
    'jane.smith',
    'admin',
    'support',
    'contact',
    'info',
    'sales',
    'marketing',
    'hello',
    'feedback',
    'user123',
    'test.account',
    'random.name',
    'developer',
    'webmaster',

    // Spanish Names
    'juan.perez',
    'maria.garcia',
    'soporte',
    'contacto',
    'ventas',
    'informacion',
    'hola',
    'usuario',
    'prueba',
    'desarrollador',

    // French Names
    'jean.dupont',
    'marie.curie',
    'contact',
    'support',
    'vente',
    'bonjour',
    'utilisateur',
    'testeur',
    'developpeur',

    // German Names
    'hans.schmidt',
    'anna.müller',
    'kontakt',
    'hilfe',
    'verkauf',
    'benutzer',
    'testkonto',
    'entwickler',

    // Italian Names
    'giuseppe.rossi',
    'maria.bianchi',
    'contatto',
    'supporto',
    'vendite',
    'utente',
    'prova',
    'sviluppatore',

    // Portuguese Names
    'joao.silva',
    'maria.oliveira',
    'contato',
    'suporte',
    'vendas',
    'usuario',
    'teste',
    'desenvolvedor',

    // Korean Names (Hangul)
    '홍길동',
    '김철수',
    '고객지원',
    '연락처',
    '판매',
    '사용자',

    // Japanese Names (Kanji and Kana)
    '山田太郎',
    '鈴木花子',
    '情報',
    'サポート',
    '日本語',
    'テスト',
    '携帯',
    '電子',

    // Chinese Names (Chinese Characters)
    '李伟',
    '王芳',
    '张三',
    '联系',
    '测试',
    '用户',
    '开发',

    // Indian Names
    'arjun.sharma',
    'priya.kumar',
    'support',
    'contact',
    'vikas',
    'pariksha',
    'upayogakarta',

    // Russian Names (Cyrillic)
    'иван.иванов',
    'анна.петровна',
    'поддержка',
    'контакт',
    'продажи',
    'пользователь',
    'разработчик',

    // Miscellaneous
    'alpha.beta',
    'charlie.delta',
    'test123',
    'mock.user',
    'example.name',
    'first.last',
    'nickname',
    'alias',
    'temp.account',
    'demo.user',
];

export type EMAIL_SAMPLES = [
    // English full emails
    'john.doe@mion.io',
    'jane.smith@rpc.org',
    'admin@wiki.org',
    'support@www.mion.org',
    'contact@www.api.org',
    'info@arch.org',
    'sales@ccmns.org',
    'marketing@eff.org',
    'hello@fsf.org',
    'feedback@opensource.org',
    'user123@node.org',
    'test.account@typescript.org',
    'random.name@rpc.org',
    'developer@fullstack.org',
    'webmaster@mion.io',

    // Spanish full emails
    'juan.perez@wiki.org',
    'maria.garcia@arch.org',
    'soporte@ccmns.org',
    'contacto@eff.org',
    'ventas@fsf.org',
    'informacion@opensource.org',
    'hola@node.org',
    'usuario@typescript.org',
    'prueba@rpc.org',
    'desarrollador@fullstack.org',

    // French full emails
    'jean.dupont@mion.io',
    'marie.curie@wiki.org',
    'vente@arch.org',
    'bonjour@ccmns.org',
    'utilisateur@eff.org',
    'testeur@fsf.org',
    'developpeur@opensource.org',

    // German full emails
    'anna.müller@node.org',
    'anna.schmidt@typescript.org',
    'kontakt@rpc.org',
    'hilfe@fullstack.org',
    'verkauf@mion.io',
    'benutzer@wiki.org',
    'entwickler@arch.org',

    // Chinese full emails
    '王芳@ccmns.org',
    '联系@eff.org',
    '测试@fsf.org',
    'ceshi@opensource.org',
    '张三@node.org',
    'kaifa@typescript.org',

    // Indian full emails
    'arjun.sharma@rpc.org',
    'priya.kumar@fullstack.org',
    'vikas@mion.io',
    'pariksha@wiki.org',
    'upayogakarta@arch.org',

    // Russian full emails (Cyrillic)
    'иван.иванов@ccmns.org',
    'анна.петровна@eff.org',
    'поддержка@fsf.org',
    'контакт@opensource.org',
    'продажи@node.org',
    'пользователь@typescript.org',
    'разработчик@rpc.org',

    // Miscellaneous
    'alpha.beta@fullstack.org',
    'charlie.delta@mion.io',
    'test123@wiki.org',
    'mock.user@arch.org',
    'example.name@ccmns.org',
    'first.last@eff.org',
    'nickname@fsf.org',
    'alias@opensource.org',
    'temp.account@node.org',
    'demo.user@typescript.org',

    // Tricky but valid email addresses
    'email+tag@mion.io', // Plus sign for tagging/filtering
    'email-with-hyphen@rpc.org', // Hyphen in local part
    'email_with_underscore@wiki.org', // Underscore in local part
    'very.common@arch.org', // Multiple dots in local part
    "!#$%&'*+-/=?^_`{|}~@ccmns.org", // Special chars allowed in local part
    '"quoted"@eff.org', // Quoted local part
    '"very.(),:;<>[]\\"@opensource.org', // Quoted local part with special chars
    'user.name+tag+sorting@example.com', // Multiple plus signs
    'x@example.com', // Single character local part
    'example-indeed@strange-example.com', // Hyphen in domain
    'test/test@test.com', // Slash in local part (valid in quoted form)
    'very."(),:;<>[]..very.unusual@strange.example.com', // Very unusual but valid
    'user%example.com@mion.io', // Routing format
    'user-@example.org', // Hyphen at end of local part
];

export type EMAIL_SAMPLES_PUNYCODE = [
    // English full emails with regular domains
    'john.doe@mion.io',
    'jane.smith@rpc.org',

    // English full emails with Punycode domains
    'admin@xn--e1afmkfd.xn--p1ai', // admin@пример.рф
    'support@xn--80aaicww6a.xn--p1acf', // support@домен.срб

    // Spanish full emails with regular domains
    'juan.perez@wiki.org',
    'maria.garcia@arch.org',

    // Spanish full emails with Punycode domains
    'soporte@xn--mgbh0fb.xn--kgbechtv', // soporte@موقع.مصر
    'contacto@xn--fiqz9s.xn--fiqs8s', // contacto@网址.中国

    // Russian full emails with regular domains
    'иван.иванов@ccmns.org',

    // Russian full emails with Punycode domains
    'анна.петровна@xn--80adxhks.xn--p1ai', // анна.петровна@москва.рф
    'поддержка@xn--d1acufc.xn--j1amh', // поддержка@сайт.укр

    // Miscellaneous with regular domains
    'user.name+tag+sorting@example.com',
    'user@sub-domain.example-site.com',
    'user@domain.with-number123.com',

    // Miscellaneous with Punycode domains
    'user@xn--80akhbyknj4f.xn--p1ai', // user@испытание.рф
    'x@xn--mgberp4a5d4ar.xn--mgbaam7a8h', // x@السعودية.امارات
    'test@xn--qxam.xn--zckzah', // test@テスト.テスト
    'info@xn--9n2bp8q.xn--9t4b11yi5a', // info@테스트.한국
];

export type URL_SAMPLES = [
    // http and https
    'https://mion.io',
    'https://rpc.org',
    'http://wiki.org',
    'https://www.mion.org',
    'http://www.api.org',
    'https://arch.org/path/to/resource',
    'http://ccmns.org/path/to/resource',
    'https://eff.org?query=param',
    'http://fsf.org?query=param#hello-world',
    'https://opensource.org#fragment',
    'http://node.org#fragment',
    'https://subdomain.typescript.org',
    'http://subdomain.rpc.org',
    'https://fullstack.org:8080',

    // localhost and IP addresses
    'http://localhost:8080/path/to/resource',
    'https://127.0.0.1:8080/path/to/resource',
    'https://254.60.167.80:80/path/to/resource',
    'http://:8080/path/to/resource',
    'http://[::1]:8080/path/to/resource',
    'http://[::]:8080/path/to/resource?query=param',
    'http://[::1]:8080/path/to/resource#fragment',
    'http://[::1]/path/to/resource',

    // ws and wss
    'ws://mion.io/socket',
    'ws://websocket.org/socket',
    'wss://socket.io/socket',
    'ws://live.com/socket?query=param',
    'wss://sock.org/socket?query=param#fragment',
    'ws://socketcluster.io/socket#fragment',
    'wss://developer..dev:8080/socket',
    'ws://fast.com:8080/socket?query=param',

    /// ftp & ftps
    'ftp://example.com/file.txt',
    'ftps://example.com/file.txt',
];

export type FILE_URL_SAMPLES = [
    // File URLs
    'file:///path/to/file.txt',
    'file:///C:/path/to/file.txt',
    'file://localhost/path/to/file.txt',
    'file:///home/user/file.txt',
    'file://example.com/path/to/file.txt',
    'file:///C:/Users/User/Documents/file.txt',
    'file:///tmp/file.txt',
    'file:///var/log/syslog',

    // File URLs with query parameters
    'file:///path/to/file.txt?query=param',
    'file:///C:/path/to/file.txt?query=param',

    // file URLs with special characters
    'file:///path/to/file%20with%20spaces.txt',
    'file:///path/to/file@with@special#characters.txt',

    // file with localhost & ips

    'file://localhost/path/to/file.txt',
    'file://localhost/C:/path/to/file.txt',
    'file://localhost/home/user/file.txt',
    'file://127.0.0.1:890/example.com/path/to/file.txt',
    'file://localhost/path/to/file.txt?query=param',
    'file:///home/user/file.txt?query=param',
];

export type HTTP_URL_SAMPLES = [
    // http and https
    'https://mion.io',
    'https://rpc.org',
    'http://wiki.org',
    'https://www.mion.org',
    'http://www.api.org',
    'https://arch.org/path/to/resource',
    'http://ccmns.org/path/to/resource',
    'https://eff.org?query=param',
    'http://fsf.org?query=param#hello-world',
    'https://opensource.org#fragment',
    'http://node.org#fragment',
    'https://subdomain.typescript.org',
    'http://subdomain.rpc.org',
    'https://fullstack.org:8080',

    // localhost and IP addresses
    'http://localhost:8080/path/to/resource',
    'https://127.0.0.1:8080/path/to/resource',
    'https://254.60.167.80:80/path/to/resource',
    'http://:8080/path/to/resource',
    'http://[::1]:8080/path/to/resource',
    'http://[::]:8080/path/to/resource?query=param',
    'http://[::1]:8080/path/to/resource#fragment',
    'http://[::1]/path/to/resource',
];

export type SOCIAL_MEDIA_URL_SAMPLES = [
    // Social Media URLs
    'https://www.facebook.com/user',
    'https://twitter.com/user',
    'https://www.instagram.com/user/',
    'https://www.linkedin.com/in/user/',
    'https://www.tiktok.com/@user',
    'https://www.youtube.com/c/user',
    'https://www.snapchat.com/add/user',
    'https://www.pinterest.com/user?query=param',
    'https://www.reddit.com/user/user#fragment',
    'https://www.whatsapp.com/user/',

    'http://www.facebook.com/user',
    'http://twitter.com/user',
    'http://www.instagram.com/user/',
    'http://www.linkedin.com/in/user/?query=param',
    'http://www.tiktok.com/@user',
    'http://www.youtube.com/c/user',
    'http://www.snapchat.com/add/user?query=param#fragment',
    'http://www.pinterest.com/user/',
    'http://www.reddit.com/user/user/#fragment',
    'http://www.whatsapp.com/user/',
];

export type SOCIAL_MEDIA_DOMAINS_SAMPLES = [
    'facebook',
    'twitter',
    'instagram',
    'linkedin',
    'tiktok',
    'youtube',
    'snapchat',
    'pinterest',
    'reddit',
    'whatsapp',
];

export const TLD_SAMPLES = [
    'com',
    'org',
    'net',
    'io',
    'ai',
    'app',
    'co',
    'dev',
    'tech',
    'co.uk',
    'com.au',
    'com.br',
    'com.mx',
    'com.ar',
];
export const NAME_SAMPLES = [
    'mion',
    'mionkit',
    'example',
    'gogle',
    'fcbook',
    'amzn',
    'twitt',
    'insta',
    'linked',
    'yoube',
    'pinturist',
    'mion',
    'mionkit',
    'wiki',
    'red',
    'line',
    'hello',
    'world',
    'test',
    'random',
    'user',
    'developer',
    'webmaster',
    'admin',
    'support',
    'contact',
    'info',
    'mion',
    'mionkit',
];

export const TLD_CHARS = 'abcdefghijklmnopqrstuvwxyz';
export const NAME_CHARS = 'abcdefghijklmnopqrstuvwxyz0123456789';
export const NAME_CHARS_UNICODE =
    'abcdefghijklmnopqrstuvwxyz0123456789' +
    // Cyrillic (Russian)
    'абвгдеёжзийклмнопрстуфхцчшщъыьэюя' +
    // Japanese (Hiragana and Katakana samples)
    'あいうえおかきくけこさしすせそたちつてとなにぬねのアイウエオカキクケコサシスセソタチツテト' +
    // Chinese (Simplified) samples
    '中国网址域名汉字电脑互联网技术计算机软件编程' +
    // Korean (Hangul) samples
    '한국어도메인이름인터넷기술컴퓨터소프트웨어프로그래밍' +
    // Arabic samples
    'ابتثجحخدذرزسشصضطظعغفقكلمنهوي';
export const INTERNET_PROTOCOLS = ['http', 'https', 'ftp', 'ftps', 'ws', 'wss', 'file'];

// Create a value export for EMAIL_NAME_SAMPLES
export const EMAIL_NAME_SAMPLES_ARRAY: string[] = [
    'john.doe',
    'jane.smith',
    'admin',
    'support',
    'contact',
    'info',
    'sales',
    'marketing',
    'hello',
    'feedback',
    'user123',
    'test.account',
    'random.name',
    'developer',
    'webmaster',
    'juan.perez',
    'maria.garcia',
    'soporte',
    'contacto',
    'ventas',
    'informacion',
    'hola',
    'usuario',
    'prueba',
    'desarrollador',
    'jean.dupont',
    'marie.curie',
    'vente',
    'bonjour',
    'utilisateur',
    'testeur',
    'developpeur',
];
