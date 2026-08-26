# TTML 歌词文件规范

## 一、 基础与全局规范

### 1. 目的与概述

所有提交到本仓库的歌词文件都**必须**遵循此规范，以便正确解析和存储。


> [!WARNING]
> 为了确保可读性，下列的 TTML 片段示例经过格式化。但上传 TTML 文件时，**不建议**格式化。详细信息请参考[3.3 空格与格式化规范](#33-空格与格式化规范)。

---

### 2. 文件基本结构

每个 TTML 文件都必须是一个合法的 XML 文档，并包含以下基本结构和命名空间声明。

```xml
<?xml version="1.0" encoding="UTF-8"?>
<tt xmlns="http://www.w3.org/ns/ttml"
    xmlns:ttm="http://www.w3.org/ns/ttml#metadata"
    xmlns:tts="http://www.w3.org/ns/ttml#styling"
    xmlns:itunes="http://itunes.apple.com/lyric-ttml-extensions"
    xmlns:amll="http://www.example.com/ns/amll"
    xml:lang="en"
    itunes:timing="Word">

    <head>
        <!-- 元数据 -->
    </head>

    <body dur="00:15.500">
        <!-- 歌词内容 -->
    </body>
</tt>
```

* **XML 声明**: TTML 文件中不得包含字节顺序标记 (BOM)。
* **根元素**: 必须是 `<tt>`。
* **命名空间**:
  * `xmlns`, `xmlns:ttm`, `xmlns:tts` 是标准 TTML 必需的。
  * `xmlns:itunes` 可选，用于 Apple Music 特定的属性，如 `itunes:timing` 和 `itunes:songPart`。
  * `xmlns:amll` 用于 AMLL 的元数据。

* **`xml:lang`**: **必填**，在 `<tt>` 标签上指定歌词的主要语言代码 (例如 `zh-Hans` 代表简体中文, `ja` 代表日语, `en` 代表英语)。

* **`itunes:timing`**: **必填**，用于声明逐行或逐字歌词。
  * `Word`: 逐字歌词。
  * `Line`: 逐行歌词。

* **`body` 元素**: 用于包含所有歌词行 (`<p>`) 和结构块 (`<div>`)。
  * **`dur`**: **可选，并不会影响时长计算。主要用于参考**。如果包含，其值**必须大于或等于**文件中最后一个时间戳的结束时间。所有内部元素的时间戳都不得超过此 `dur` 值。

    ```xml
    <body dur="04:15.500">
    </body>
    ```

---

### 3. 全局数据规范

#### 3.1 时间戳格式

本文档中所有的时间值（如 `begin`, `end`, `dur` 属性的值）都必须遵循以下以半角冒号 `:` 为分隔符的格式之一：

* **单段格式 (秒)**：`ss` 或 `ss.xxx`

  * 仅提供秒数。可以超出 60 秒，也可以包含小数表示毫秒。
  * **示例**: `45`, `12.5`, `120.456`

* **两段格式 (分:秒)**：`mm:ss` 或 `mm:ss.xxx`

  * 提供分钟和秒数。
  * **示例**: `01:30`, `2:45.500`, `00:15.5`

* **三段格式 (时:分:秒)**：`hh:mm:ss` 或 `hh:mm:ss.xxx`

  * 提供小时、分钟和秒数。
  * **示例**: `01:02:03`, `1:4.150`, `0:00.000`

**时间戳规范与限制说明**

1. **分隔符严格限制**: 必须使用半角冒号 `:` 分隔，且最多只能出现两个冒号（即最高支持到小时）。超过三个部分（例如 `dd:hh:mm:ss`）将会导致解析失败。
2. **纯数字**: 时间字符串中**不能包含**任何字母，如 `s`、`ms` 或 `h`（例如 `10.0s` 是非法的，必须写为 `10.0`）。
3. **前导零不敏感**: 前导零是可选的，并不会影响解析。

#### 3.2 语言代码规范 (BCP-47)

本文档中所有用于指定语言的 `xml:lang` 属性，其值 **必须** 遵循 IETF 的 **BCP-47** 标准。

BCP-47 是用于标识人类语言的国际标准代码。它通常由一系列用连字符 (`-`) 分隔的子标签组成，用以表示语言、文字、地区等信息，其完整格式为 <ruby>macrolang<rt>宏语言</rt></ruby>-<ruby>extlang<rt>扩展语言</rt></ruby>-<ruby>script<rt>文字</rt></ruby>-<ruby>region<rt>区域</rt></ruby>-<ruby>variant<rt>变体</rt></ruby>-<ruby>extension<rt>扩展</rt></ruby>-<ruby>privateuse<rt>私有</rt></ruby>。

> [!TIP]
> 你可以通过 [IANA 语言子标签注册表](https://www.iana.org/assignments/language-subtag-registry/language-subtag-registry) 查询所有有效的语言代码。

**常见示例**

* **基本语言标签**: `ja` (日语), `en` (英语), `ko` (韩语)
* **语言-文字标签**: `zh-Hans` (简体中文), `zh-Hant` (繁体中文), `ja-Latn` (日语罗马音)
* **语言-区域标签**: `en-US` (美国英语), `en-GB` (英国英语)
* **语言-文字-区域标签**: `zh-Hans-CN` (中国大陆地区使用的简体中文)

**应用范围**

此规范适用于文件中所有出现的 `xml:lang` 属性，包括但不限于：

* **根元素**: `<tt xml:lang="...">`
* **头信息翻译**: `<translation type="subtitle" xml:lang="...">`
* **头信息音译**: `<transliteration xml:lang="...">`

#### 3.3 空格与格式化规范

**格式化支持**

你可以使用格式化工具来格式化 TTML 文件。但 `<span>` 标签后的所有空格均会丢失（只要 `<span>` 标签后包含换行符）。

若要保留这些空格，请将空格直接写入到 `<span>` 标签内。例如：

```xml
<p begin="24.262" end="29.397" itunes:key="L6" ttm:agent="v1">
    <span begin="24.262" end="24.496">You </span>
    <span begin="24.496" end="24.802">telling </span>
    <span begin="24.802" end="25.101">this </span>
    <span begin="25.101" end="25.599">story </span>
    <span begin="25.599" end="25.844">or </span>
    <span begin="25.844" end="26.018">am </span>
    <span begin="26.018" end="26.530">I?</span>
    <span ttm:role="x-bg">
        <span begin="26.615" end="26.903">(I'm </span>
        <span begin="26.903" end="27.181">sorry, </span>
        <span begin="27.181" end="27.315">mi </span>
        <span begin="27.315" end="27.674">vida, </span>
        <span begin="27.674" end="27.869">go </span>
        <span begin="27.869" end="29.397">on)</span>
    </span>
</p>
```

或者，将两个应该以空格连接的音节写成一行：

```xml
<span begin="24.262" end="24.496">You</span> <span begin="24.496" end="24.802">telling</span>
                                       <!-- ^ 此处有一个空格 -->
```

---

## 二、 文件头与元数据 (`<head>`)

所有元数据都应放置在 `<head><metadata>...</metadata></head>` 标签内。
有多个值的，应为**每个值**创建一个标签。

### 4. 基础元数据

#### 4.1 歌曲与演唱者

使用标准 TTML 标签来定义歌曲基础信息和演唱者。

* **歌曲名**: 可以使用 `<ttm:title>`，最后会转换为 `musicName`。**不要**同时在 `<ttm:title>` 和 `musicName` 标签添加相同的值。
* **演唱者**: 使用 `<ttm:agent>` 定义所有演唱者。
   * **`type` 属性**: 指明类型，支持以下值：
      * `person` (独唱)
      * `organization` (团体)
      * `group` (合唱)
      * `other` (其他)
   * **`xml:id` 属性**: 为每位演唱者提供唯一的引用 ID。分配建议如下：
      * `person`、`organization`: 统一从 `v1` 开始连续递增（如 `v1`, `v2`, `v3`...）。
      * `group`: 使用 `v1000`。
      * `other`: 使用 `v2000`。
      * *注意：`group` 和 `other` 类型通常整首歌只出现一个 ID。

* **`<ttm:name>` 标签**: 提供演唱者名称。**仅支持** `type="full"` 属性。

示例：

```xml
<ttm:agent type="person" xml:id="v1" />
<ttm:agent type="person" xml:id="v2" />
<ttm:agent type="group" xml:id="v1000" />
```

```xml
<ttm:agent type="person" xml:id="v1">
    <ttm:name type="full">周杰伦</ttm:name>
</ttm:agent>
```

* **其他 `<ttm:...>` 标签**: 会被忽略。

#### 4.2 AMLL 元数据

使用 `<amll:meta>` 标签提供歌曲的核心信息。

* **歌曲名**: `key="musicName"`，**必填**
* **艺人名**: `key="artists"`，**必填**
* **专辑名**: `key="album"` (如果是单曲，专辑名应与歌曲名相同)，**必填**
* **ISRC号码**: `key="isrc"`

为了使歌词能够关联到各大音乐平台，**必须至少提供一个**平台 ID。

* **网易云音乐**: `key="ncmMusicId"`
* **QQ 音乐**: `key="qqMusicId"`
* **Spotify**: `key="spotifyId"`
* **Apple Music**: `key="appleMusicId"`

可以使用 AMLL 元数据标记歌词作者，例如：

* **逐词歌词作者 Github ID**: `key="ttmlAuthorGithub"`
* **逐词歌词作者 GitHub 用户名**: `key="ttmlAuthorGithubLogin"`


```xml
<head>
    <metadata>
        <ttm:agent type="person" xml:id="v1">
            <ttm:name type="full">艺人A</ttm:name>
        </ttm:agent>
        <ttm:agent type="person" xml:id="v2">
            <ttm:name type="full">艺人B</ttm:name>
        </ttm:agent>
        <ttm:agent type="group" xml:id="v1000" />

        <amll:meta key="musicName" value="歌曲名" />
        <amll:meta key="artists" value="艺术家名" />
        <amll:meta key="album" value="专辑名"/>
        <amll:meta key="ncmMusicId" value="123456789"/>
        <amll:meta key="spotifyId" value="123456789"/>
        <amll:meta key="ttmlAuthorGithub" value="123456789"/>
        <amll:meta key="ttmlAuthorGithubLogin" value="你的 Github 用户名"/>
    </metadata>
</head>
```

### 5. Apple Music 扩展相关


**结构说明**

1. **位置**: 所有 Apple Music 样式的辅助轨道数据都必须置于 `<head><metadata>...</metadata></head>` 内部。
2. **主容器**: 需要一个 `<iTunesMetadata>` 标签作为所有 Apple Music 特定元数据的容器。
3. **轨道类型容器**:
   * **翻译**: 使用 `<translations>` 标签包裹。
   * **音译**: 使用 `<transliterations>` 标签包裹。
   * **歌曲创作者**: 使用 `<songwriters>` 标签包裹。
4. **语言块**:
   * 在 `<translations>` 或 `<transliterations>` 内部，每个 `<translation>` 或 `<transliteration>` 块代表一种语言的轨道。
   * 每个 `<translation>` 代表一种语言的翻译，且**必须**包含以下属性：
     * `type="翻译类型"`，可以为 `subtitle` 或 `replacement`。`subtitle` 适用于大部分翻译内容，`replacement`一般用于简繁中文转换。
     * `xml:lang="语言代码"` (例如: `zh-Hans-CN`)
5. **文本链接**:
   * 在每个语言块内部，内容由一个或多个 `<text>` 标签承载。
   * 通过 `for` 属性将内容与歌词行进行关联，其值**必须**与 `<body>` 中对应 `<p>` 标签的 `itunes:key` 值完全一致 (例如, `for="L1"`)。

**内容格式**

`<text>` 标签内部的内容可以是以下两种格式之一：

* **逐行**: 直接包含翻译或音译的纯文本。

```xml
<text for="L1">This is a line-by-line translation</text>
```

* **逐字**: 包含一个或多个带 `begin` 和 `end` 属性的 `<span>` 标签。`begin` 和 `end` 属性的值必须和对应的主歌词音节的 `begin` 和 `end` 属性值相同。

```xml
<text for="L29">
    <span begin="2:49.800" end="2:50.040">你</span>
    <span begin="2:50.040" end="2:50.310">還</span>
    <span begin="2:50.310" end="2:50.760">好</span>
    <span begin="2:50.760" end="2:51.790">嗎</span>
    <span begin="2:52.250" end="2:52.540">思</span>
    <span begin="2:52.540" end="2:52.920">緒</span>
    <span begin="2:52.920" end="2:53.560">明</span>
    <span begin="2:53.560" end="2:54.100">滅</span>
    <span ttm:role="x-bg">
        <span begin="2:53.160" end="2:53.750">(思</span>
        <span begin="2:53.750" end="2:54.500">緒</span>
        <span begin="2:54.500" end="2:55.070">明</span>
        <span begin="2:55.070" end="2:55.680">滅)</span>
    </span>
</text>
```

**背景人声**

你可以在 `<text>` 标签内使用 `<span ttm:role="x-bg">` 来给背景人声提供翻译或音译。

* 对于**逐行**的背景人声辅助歌词，在 `<text>` 内使用带 `ttm:role="x-bg"` 的 `<span>`。
* 对于**逐字**的背景人声辅助歌词，在 `ttm:role="x-bg"` 的 `<span>` 内部再嵌套带时轴的 `<span>`。

**示例 1：逐行翻译**
以下示例展示了如何在头信息中定义简体中文翻译，并将其链接到正文中的歌词行。

```xml
<head>
    <metadata>
        <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">
            <translations>
                <translation type="subtitle" xml:lang="zh-Hans">
                    <text for="L6">
                        你讲还是我讲
                        <span ttm:role="x-bg">(抱歉 亲爱的 请继续)</span>
                    </text>
                    <text for="L7">
                        布鲁诺说 看来要下雨
                        <span ttm:role="x-bg">(他为何说出来)</span>
                    </text>
                    <text for="L8">
                        那样做让我心绪难宁
                        <span ttm:role="x-bg">(奶奶 请把雨伞拿出来)</span>
                    </text>
                </translation>
            </translations>
        </iTunesMetadata>
    </metadata>
</head>
<!-- 省略了其他歌词行 -->
<body dur="3:36.120">
    <div begin="10.522" end="43.125" itunes:songPart="Verse">
        <p begin="24.262" end="29.397" itunes:key="L6" ttm:agent="v1">
            <span begin="24.262" end="24.496">You </span>
            <span begin="24.496" end="24.802">telling </span>
            <span begin="24.802" end="25.101">this </span>
            <span begin="25.101" end="25.599">story </span>
            <span begin="25.599" end="25.844">or </span>
            <span begin="25.844" end="26.018">am </span>
            <span begin="26.018" end="26.530">I?</span>
            <span ttm:role="x-bg">
                <span begin="26.615" end="26.903">(I'm </span>
                <span begin="26.903" end="27.181">sorry, </span>
                <span begin="27.181" end="27.315">mi </span>
                <span begin="27.315" end="27.674">vida, </span>
                <span begin="27.674" end="27.869">go </span>
                <span begin="27.869" end="29.397">on)</span>
            </span>
        </p>
        <p begin="28.487" end="34.116" itunes:key="L7" ttm:agent="v1">
            <span begin="28.487" end="28.900">Bru</span>
            <span begin="28.900" end="29.266">no </span>
            <span begin="29.266" end="29.596">says, </span>
            <span begin="29.596" end="29.849">"It </span>
            <span begin="29.849" end="30.315">looks </span>
            <span begin="30.315" end="30.688">like </span>
            <span begin="30.688" end="31.564">rain"</span>
            <span ttm:role="x-bg">
                <span begin="31.391" end="31.665">(Why </span>
                <span begin="31.665" end="31.797">did </span>
                <span begin="31.797" end="32.096">he </span>
                <span begin="32.096" end="32.439">tell </span>
                <span begin="32.439" end="34.116">us?)</span>
            </span>
        </p>
        <p begin="32.977" end="38.719" itunes:key="L8" ttm:agent="v1">
            <span begin="32.977" end="33.350">In </span>
            <span begin="33.350" end="33.884">doing </span>
            <span begin="33.884" end="34.242">so, </span>
            <span begin="34.242" end="34.472">he </span>
            <span begin="34.472" end="34.950">floods </span>
            <span begin="34.950" end="35.390">my </span>
            <span begin="35.390" end="36.245">brain</span>
            <span ttm:role="x-bg">
                <span begin="35.712" end="36.212">(Abuela, </span>
                <span begin="36.212" end="36.340">get </span>
                <span begin="36.340" end="36.491">the </span>
                <span begin="36.491" end="36.773">um</span>
                <span begin="36.773" end="37.067">brel</span>
                <span begin="37.067" end="38.719">las)</span>
            </span>
        </p>
    </div>
</body>
```

**示例 2：逐字音译**

```xml
<head>
    <metadata>
        <iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">
            <transliterations>
                <transliteration xml:lang="ja-Latn">
                    <text for="L1">
                        <span begin="1.241" end="1.635">yume </span>
                        <span begin="1.635" end="2.152">nara </span>
                        <span begin="2.152" end="2.651">ba </span>
                        <span begin="2.651" end="3.352">dore</span>
                        <span begin="3.352" end="4.003">hodo </span>
                        <span begin="4.003" end="4.352">yo</span>
                        <span begin="4.352" end="4.920">katta </span>
                        <span begin="4.920" end="5.368">de</span>
                        <span begin="5.368" end="6.433">shou</span>
                    </text>
                    <text for="L2">
                        <span begin="6.781" end="7.805">imada </span>
                        <span begin="7.805" end="8.120">ni </span>
                        <span begin="8.120" end="8.514">ana</span>
                        <span begin="8.514" end="9.138">ta </span>
                        <span begin="9.138" end="9.504">no </span>
                        <span begin="9.504" end="9.837">koto </span>
                        <span begin="9.837" end="10.354">o </span>
                        <span begin="10.354" end="11.117">yume ni </span>
                        <span begin="11.117" end="11.295">mi</span>
                        <span begin="11.295" end="11.974">ru</span>
                    </text>
                </transliteration>
            </transliterations>
        </iTunesMetadata>
    </metadata>
</head>
<body dur="4:16.107">
    <div begin="1.241" end="23.218" itunes:songPart="Verse">
        <p begin="1.241" end="6.433" itunes:key="L1" ttm:agent="v1">
            <span begin="1.241" end="1.635">夢</span>
            <span begin="1.635" end="2.152">なら</span>
            <span begin="2.152" end="2.651">ば</span>
            <span begin="2.651" end="3.352">どれ</span>
            <span begin="3.352" end="4.003">ほど</span>
            <span begin="4.003" end="4.352">よ</span>
            <span begin="4.352" end="4.920">かった</span>
            <span begin="4.920" end="5.368">で</span>
            <span begin="5.368" end="6.433">しょう</span>
        </p>
        <p begin="6.781" end="11.974" itunes:key="L2" ttm:agent="v1">
            <span begin="6.781" end="7.805">未だ</span>
            <span begin="7.805" end="8.120">に</span>
            <span begin="8.120" end="8.514">あな</span>
            <span begin="8.514" end="9.138">た</span>
            <span begin="9.138" end="9.504">の</span>
            <span begin="9.504" end="9.837">こと</span>
            <span begin="9.837" end="10.354">を</span>
            <span begin="10.354" end="11.117">夢に</span>
            <span begin="11.117" end="11.295">み</span>
            <span begin="11.295" end="11.974">る</span>
        </p>
    </div>
</body>
```

**歌曲创作者**

* **格式**: 在 `<songwriters>` 内部使用一个或多个 `<songwriter>` 标签列出创作者姓名
* **说明**: 此标签用于声明歌曲的词曲作者，内容为纯文本

```xml
<iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal">
    <songwriters>
        <songwriter>方文山</songwriter>
        <songwriter>周杰伦</songwriter>
    </songwriters>
</iTunesMetadata>
```

---

## 三、 正文与歌词结构 (`<body>`)

### 6. 歌词计时模式

时间戳必须严格遵循以下规则：

1. **有效性**: `begin` 时间必须早于 `end` 时间。
2. **嵌套规则**: 子元素的时间戳必须完全包含在父元素的时间戳之内。
   * 例: `<span>` 的时间范围必须在 `<p>` 的时间范围内；`<p>` 的时间范围必须在 `<div>` 的时间范围内。
3. **范围**: 所有时间戳必须在歌曲的总时长 (`body` 的 `dur` 属性) 之内。
4. **重叠**: 不同演唱者的 `<p>` 或 `<span>` 时间戳可以重叠，但同一演唱者的 `<p>` 或 `<span>` 时间戳不能重叠。因混音而使时间重叠的情况除外。

#### 6.1 逐行歌词

当 `<p>` 标签中只有纯文本内容时（翻译和音译 `<span>` 除外），这行歌词会被视为逐行歌词。

* 每行歌词在一个**带有 `begin` 和 `end` 属性的 `<p>` 标签**内。
* 该行所有的文本内容直接放在 `<p>` 标签内。可以为了添加翻译等信息使用 `<span>`，但这些 `<span>` 的 `begin` / `end` 属性会被忽略。

```xml
<p begin="1.000" end="3.500">一行歌词</p>
```

#### 6.2 逐字歌词

当 `itunes:timing="Word"` 时：

* 每一行歌词在一个 `<p>` 标签内。
* 每个音节都必须包裹在**带有 `begin` 和 `end` 属性的 `<span>` 标签**中。

```xml
<p begin="37.894" end="43.125" itunes:key="L9" ttm:agent="v1">
    <span begin="37.894" end="38.585">Married </span>
    <span begin="38.585" end="38.834">in </span>
    <span begin="38.834" end="39.101">a </span>
    <span begin="39.101" end="40.020">hurri</span>
    <span begin="40.020" end="40.888">cane</span>
    <span ttm:role="x-bg">
        <span begin="40.662" end="40.799">(What </span>
        <span begin="40.799" end="40.922">a </span>
        <span begin="40.922" end="41.482">joyous </span>
        <span begin="41.482" end="41.774">day, </span>
        <span begin="41.774" end="42.140">but </span>
        <span begin="42.140" end="42.609">any</span>
        <span begin="42.609" end="43.125">way)</span>
    </span>
</p>
```

### 7. 歌词内容与排版

#### 7.1 歌曲段落结构

使用 `<div>` 标签来分割歌曲的不同部分（如主歌、副歌），并通过 `itunes:songPart` 属性来标记。这是可选的内容。

> [!TIP]
> `itunes:song-part` 属性也可以兼容，但现已弃用。

* `itunes:songPart` 属性可以指定为任意值，但我们建议使用以下值：

  * `Verse` (主歌)
  * `Chorus` (副歌)
  * `PreChorus` (预副歌)
  * `Bridge` (桥段)
  * `Intro` (前奏)
  * `Outro` (尾奏)
  * `Refrain` (叠句)
  * `Instrumental` (器乐)

* `<div>` 块可以拥有 `begin` 和 `end` 时间戳，其时间范围必须能完全包含内部所有子元素的时间。

```xml
<body>
    <div begin="10.000" end="25.000" itunes:songPart="Verse">
        <p begin="..." end="...">...</p>
        <p begin="..." end="...">...</p>
    </div>
    <div begin="25.500" end="40.000" itunes:songPart="Chorus">
        <p begin="..." end="...">...</p>
    </div>
</body>
```

#### 7.2 行、字词与演唱者

* **行 (`<p>`)**: `<p>` 标签用于放置歌词中的每一行。应使用 `<p>` 分隔歌词行，而不是 `<br>`。
* **字词 (`<span>`)**: 在逐字歌词中，`<span>` 用于标记单个字词或音节的时间。
* **演唱者 (`ttm:agent`)**: 在 `<p>` 标签上使用 `ttm:agent` 属性，并通过在 `<head>` 中定义的 `xml:id` (如 `v1`) 来指明演唱者。
* **行号 (`itunes:key`)**: 用于标记歌词行的唯一编号。其格式为 `L` 加上从 1 开始的行号 (例如 `L1`, `L2`, ...)。行号**必须**是连续且递增的，即使在不同的 `<div>` 块之间。

> [!WARNING]
> 即使是单人演唱的歌曲，也应为 `<p>` 标签添加 `ttm:agent="v1"`，并定义 "v1" agent。

#### 7.3 辅助歌词：背景人声

* **背景人声**: 使用 `<span ttm:role="x-bg" begin="..." end="...">...</span>`。
  * 如果背景人声出现在主唱人声之前，建议将 `<span ttm:role="x-bg">` 标签放在主唱人声的 `<span>` 标签之前。否则，请将 `<span ttm:role="x-bg">` 标签放在 `<p>` 标签的末尾。
  * 建议使用半角括号将背景人声文本包裹起来。不要添加两个或更多括号或只添加半边括号。
  * `begin` 和 `end` 属性是可选的。

```xml
<p begin="4.167" end="7.722" ttm:agent="v1" itunes:key="L2">
    <span begin="4.167" end="4.476">羽</span>
    <span begin="4.476" end="4.784">ば</span>
    <span begin="4.784" end="5.090">た</span>
    <span begin="5.090" end="5.403">く</span>
    <span begin="5.403" end="6.067">夢</span>
    <span begin="6.067" end="7.722">を</span>
    <span ttm:role="x-bg">
        <span begin="6.591" end="6.757">(見</span>
        <span begin="6.757" end="7.192">た</span>
        <span begin="7.192" end="7.340">ん</span>
        <span begin="7.340" end="7.761">だ)</span>
    </span>
</p>
```

原文引用：[AMLL格式规范](https://github.com/amll-dev/amll-ttml-db/wiki/%E6%A0%BC%E5%BC%8F%E8%A7%84%E8%8C%83)