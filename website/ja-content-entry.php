	'shouku-launcher' => array(
		'title'   => 'Shoukuランチャー',
		'menu'    => 'Shoukuランチャー',
		'excerpt' => 'Shoukuのゲームをさがして、インストールして、アップデートして、遊べるアプリ。',
		'content' => <<<'HTML'
<figure class="launcher-shot"><img src="/wp-content/uploads/shouku-launcher/store.jpg" alt="Shoukuランチャーのストア画面" width="1360" height="860" loading="lazy"><figcaption>Shoukuランチャーのストア</figcaption></figure>

<p>Shoukuランチャーは、Shoukuのゲームをすべてひとつにまとめた無料のデスクトップアプリです。ゲームをさがして、説明を読んで、プレイ動画を見て、ボタンひとつでインストール・アップデート・プレイができます。ゲームごとのページを開く必要はありません。</p>

<h2 class="wp-block-heading">ランチャーをダウンロード</h2>
<p>お使いのパソコンに合ったものを選んでください。どちらも無料のオープンソースです。</p>

[shouku_launcher_downloads]

<h2 class="wp-block-heading">しくみ</h2>
<ol>
<li><strong>ランチャーをインストール</strong>します（下の説明を見てください）。</li>
<li><strong>ストアを見る。</strong>どのゲームにも、タイトル、説明、スクリーンショット、20秒のプレイ動画があり、バージョン、対象年齢、学べることも表示されます。</li>
<li><strong>「インストール」を押す。</strong>ランチャーがshoukugames.orgからゲームを直接ダウンロードして、インストールします。進み具合は「ダウンロード」タブで確認できます。</li>
<li><strong>「プレイ」を押す。</strong>インストールしたゲームは「ライブラリ」に並び、それぞれのプレイ時間も記録されます。</li>
<li><strong>いつも最新に。</strong>ランチャーは起動するたびに（または更新ボタンを押したときに）shoukugames.orgで新しいゲームと新しいバージョンを確認します。アップデートがあるとボタンが<strong>「アップデート」</strong>に変わり、新しいゲームは自動でストアに追加されます。</li>
<li><strong>困ったときは。</strong>「バグ報告」タブで、わかりやすい報告を作って、GitHubまたはメールで送れます。</li>
</ol>

<h2 class="wp-block-heading">Windows版とLinux版</h2>
<p>ランチャーには2つの版があり、<strong>それぞれ自分のシステム用のゲームだけを表示します</strong>。だから、パソコンで動かないファイルをダウンロードしてしまうことはありません。</p>
<figure class="wp-block-table"><table>
<thead><tr><th></th><th>Windows</th><th>Linux</th></tr></thead>
<tbody>
<tr><td><strong>対応OS</strong></td><td>Windows 10 / 11（64ビット）</td><td>Debian、Ubuntu、およびLinux MintやPop!_OSなどの派生ディストリビューション（64ビット）</td></tr>
<tr><td><strong>ランチャーのファイル</strong></td><td><code>.msi</code>インストーラー（Windows インストーラー）、またはポータブル版<code>.zip</code></td><td><code>.deb</code>パッケージ（dpkg / apt）</td></tr>
<tr><td><strong>表示されるゲーム</strong></td><td>Windows用ゲーム（<code>.exe</code>）だけ</td><td>Linux用ゲーム（<code>.deb</code>）だけ</td></tr>
<tr><td><strong>ゲームのインストール方法</strong></td><td>ユーザーフォルダーにインストール（管理者権限は不要）</td><td>パスワードを確認したあと、aptでインストール（必要なものも一緒に入ります）</td></tr>
</tbody>
</table></figure>
<p>Windows版がLinux用パッケージを表示・ダウンロードすることはなく、Linux版がWindows用プログラムを表示・ダウンロードすることもありません。</p>

<h2 class="wp-block-heading">Windowsへのインストール</h2>
<ol>
<li>上から<strong>ShoukuLauncher-Setup-1.1.1.msi</strong>をダウンロードして、ダブルクリックします。Windows標準のインストーラーを使い、あなたのユーザーだけにインストールするので、管理者のパスワードは必要ありません。</li>
<li>「WindowsによってPCが保護されました」と表示されたら、<strong>「詳細情報」</strong>を押してから<strong>「実行」</strong>を押してください。インストーラーにまだコード署名がないため、この表示が出ることがあります。</li>
<li>完了すると、スタートメニューとデスクトップにShoukuランチャーが追加されます。削除するときは<strong>「設定」→「アプリ」</strong>から行います。</li>
</ol>
<p><strong>インストールしたくない場合は</strong>、<strong>ポータブル版ZIP</strong>をダウンロードし、右クリックして<strong>「すべて展開」</strong>を選び、展開したフォルダーの<strong>shoukugames.exe</strong>を開いてください。</p>

<h2 class="wp-block-heading">Debian・Ubuntuへのインストール</h2>
<p>上から<strong>.deb</strong>ファイルをダウンロードし、ダブルクリックしてソフトウェアセンターで開くか、保存したフォルダーでターミナルからインストールします。</p>
<pre class="launcher-cmd">sudo apt install ./shouku-launcher_1.0.0_amd64.deb</pre>
<p>完了すると、アプリケーションメニューにShoukuランチャーが追加されます。ゲームをインストールするときは、ゲームの<code>.deb</code>パッケージを入れるためにパスワードを聞かれます。</p>

<div class="launcher-shots">
<figure class="launcher-shot"><img src="/wp-content/uploads/shouku-launcher/game.jpg" alt="Shoukuランチャーのゲームページ：プレイ動画、スクリーンショット、インストールボタン" width="1360" height="860" loading="lazy"><figcaption>動画とスクリーンショットのあるゲームページ</figcaption></figure>
<figure class="launcher-shot"><img src="/wp-content/uploads/shouku-launcher/library.jpg" alt="Shoukuランチャーのライブラリ：インストール済みのゲームとプレイボタン" width="1360" height="860" loading="lazy"><figcaption>あなたのライブラリ</figcaption></figure>
</div>

<h2 class="wp-block-heading">オープンソース</h2>
<p>Shoukuのゲームと同じく、Shoukuランチャーもオープンソース（GPL-3.0）です。コードは<a href="https://github.com/shoukugames/shoukulauncher">GitHub</a>で公開しています。ご質問やアイデアは<a href="mailto:info@shoukugames.org">info@shoukugames.org</a>までお寄せください。</p>
HTML,
	),

