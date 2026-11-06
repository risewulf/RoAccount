<div align="center">

# RoAccount

**Gestionnaire de comptes Roblox local pour Windows.**
Coffre chiffré, multi-clients, serveurs privés, macros — le tout en local.

[Site](https://roaccount.xyz) · [Discord](https://discord.gg/u6wWWSUz3G) · [Télécharger](https://github.com/risewulf/RoAccount/releases/latest)

Tauri 2 · Rust · React

</div>

---

## Télécharger

1. Va sur la page **[Releases](https://github.com/risewulf/RoAccount/releases/latest)**.
2. Télécharge **`RoAccount_x.y.z_x64-setup.exe`** et lance-le.
3. Si Windows affiche *« Windows a protégé votre PC »* (SmartScreen) : clique sur **Informations complémentaires → Exécuter quand même**. L'appli n'est pas encore signée numériquement, le code source est entièrement ici pour vérification.

> **Important :** ferme tous les clients Roblox **avant** de lancer RoAccount. Le multi-clients ne marche que si RoAccount démarre en premier.

## Fonctionnalités

| | |
|---|---|
| 🔐 **Coffre chiffré** | Cookies chiffrés en local (Argon2id + AES-256-GCM), protégés par un mot de passe maître. Rien n'est écrit en clair. |
| 👥 **Comptes en direct** | Ajout par cookie, validation auprès de Roblox, puis Robux / Premium / amis / présence / état du cookie. |
| 🚀 **Multi-clients** | Plusieurs clients Roblox en même temps, lancement en lot avec délai réglable, bouton « Tout arrêter ». |
| 🌐 **Serveurs différents** | Dans un lot, chaque compte dans son propre serveur : le même, aléatoire, le plus proche (ping), ou ton serveur privé. |
| 🔑 **Serveurs privés** | Lister, acheter, renommer, régénérer le lien et activer/désactiver tes serveurs privés depuis l'appli. |
| ⭐ **Compte MAIN** | Marque le compte sur lequel tu joues : il est exclu des actions de groupe et de l'auto-rejoin. |
| 🧩 **Macros AutoHotkey v2** | Lance tes scripts AHK sur tes clients (le PID du client est passé en `A_Args[1]`). |
| 🪟 **Monitor** | Dispositions de fenêtres **Fit** / **Tiny**, muet par client, priorité de processus, fermeture. |
| 🔔 **Alertes Discord** | Webhook + @mention de ton ID quand un client plante, se déconnecte ou se fige. Auto-rejoin. |
| 💻 **Pour ce PC** | Mesure ton CPU/RAM et propose le bon nombre de clients, délai et disposition. |
| 🤝 **Rendre amis** | Tes comptes s'envoient et s'acceptent des demandes d'ami automatiquement. |
| 📦 **Import / export** | Import depuis Roblox Account Manager (JSON ou texte), export de cookies. |
| 📰 **Actualités** | Les nouveautés du projet directement dans l'appli. |

## Comment fonctionne le multi-clients

Roblox n'autorise qu'un client à la fois via un verrou Windows (un *mutex* nommé `ROBLOX_singletonEvent`). Au démarrage, RoAccount crée ce verrou avant Roblox et le garde ouvert : les clients voient qu'il existe et démarrent quand même côte à côte.
Pour chaque compte, l'appli demande à Roblox un **ticket de connexion** à usage unique (avec le cookie du compte), puis ouvre le lien `roblox-player:` correspondant : Windows lance le client déjà connecté.

Compte environ 1 à 1,5 Go de RAM par client.

## Sécurité & usage

- À utiliser **uniquement avec des comptes qui t'appartiennent**.
- Les cookies restent **sur ta machine**, chiffrés dans le coffre. RoAccount ne parle qu'aux API officielles `*.roblox.com` (et à ton webhook Discord si tu en configures un).
- Ne partage jamais ton cookie `.ROBLOSECURITY` ni ton fichier de coffre.
- Les exports de cookies sont en clair : stocke-les avec soin.
- Projet indépendant, sans lien avec Roblox Corporation. Utilisation à tes risques : les règles de Roblox s'appliquent à tes comptes.

## Récupérer un cookie

Dans ton navigateur connecté à Roblox : outils développeur → Application → Cookies → `roblox.com` → copie la valeur de `.ROBLOSECURITY`, puis colle-la dans **Ajouter un compte**.

## Développement

**Pré-requis :** Node.js 20+, Rust stable, Visual Studio Build Tools (workload « Développement Desktop en C++ »), WebView2.

```bash
npm install

# UI seule dans le navigateur, avec un backend simulé (mock)
npm run dev

# appli complète (front + backend Rust)
npm run tauri dev

# build de l'installeur (src-tauri/target/release/bundle/nsis/)
npm run tauri build
```

En navigateur (`npm run dev`), l'appli tourne sur des **données d'exemple** : aucun vrai compte, aucun lancement.

### Publier une version

Le workflow [`release.yml`](.github/workflows/release.yml) construit l'installeur sur GitHub Actions et le publie dans les Releases :

```bash
# 1. monte la version dans package.json, src-tauri/Cargo.toml et src-tauri/tauri.conf.json
# 2. puis :
git tag v0.2.0
git push origin v0.2.0
```

Un lancement manuel (onglet *Actions → Build & Release → Run workflow*) produit un build de test, récupérable en artefact.

## Structure

```
roaccount/
├─ src/                      # front React (vues, composants, pont typé api.ts + mock)
│  ├─ styles/theme.css       # jetons de marque (change le rouge ici)
│  ├─ lib/ api.ts · types.ts
│  ├─ components/            # TopBar, Sidebar, AccountRow, AccountDetail…
│  └─ views/                 # Comptes, Lancement, Monitor, Macros, Serveurs privés, Outils, Actualités…
└─ src-tauri/                # backend Rust
   └─ src/
      ├─ vault.rs            # coffre chiffré
      ├─ roblox.rs           # client API Roblox (comptes, serveurs, amis, serveurs privés)
      ├─ launch.rs           # lancement par ticket d'authentification
      ├─ singleton.rs        # multi-instance (mutex Roblox)
      ├─ winmgmt.rs          # fenêtres, priorité, muet (WASAPI), détection de gel
      ├─ macros.rs           # macros AutoHotkey v2
      ├─ tools.rs            # Pour ce PC, import/export, actualités
      ├─ background.rs       # auto-rejoin + alertes
      └─ commands.rs         # commandes exposées à l'UI
```

## Licence

[MIT](LICENSE) © Risewulf
