"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { m } from "framer-motion";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { Link } from "next-view-transitions";
import { cn } from "@/lib/utils";

// 隐私政策内容数据
interface SectionContent {
  title: string;
  content: string[];
}

const privacyData: Record<string, SectionContent> = {
  overview: {
    title: "摘要与范围",
    content: [
      "《隐私政策》摘要\n\n旎柏（上海）商贸有限公司（以下简称「我们」或「旎柏」）重视您的隐私保护。本摘要旨在简洁、清晰地向您说明我们如何收集、使用和保护您的个人信息。如您希望了解更多，请查阅下方完整隐私政策内容。\n\n• 会员计划：基于您与我们之间的合同关系及您的同意，我们收集您的姓名或昵称、手机号、生日、性别、头像及联络方式等，用于创建和维护您的会员账户。\n• 交易处理：基于履行购买合同的必要，我们收集您的订单记录、发货地址、联系方式、支付信息等，以处理您的订单和售后服务。\n• 营销活动：仅在获得您的单独同意后，我们才会收集您的购买记录、产品偏好、联系方式等，用于向您发送营销信息、开展广告活动。\n• 辅助服务（虚拟试妆/肌肤诊断）：仅在获得您对敏感个人信息的单独同意后，我们才会收集您的照片、实时面部画像、面部几何特征及肌肤状况等，用于提供产品推荐和虚拟试妆服务。\n• 设备权限：位置、相机、相册、麦克风等权限，均由您在设备上自主选择开启或关闭。拒绝授权仅影响对应功能，不影响其他服务。",
      "一、个人信息处理者信息\n\n个人信息处理者是指决定个人信息处理目的和方式的实体。\n\n• 处理者名称：旎柏（上海）商贸有限公司\n• 注册地址：上海市普陀区信泰中心T3栋610室\n• 联系邮箱：service@nihplod.cn\n• 联系页面：通过本网站「联系我们」页面提交您的问题\n\n如您对本隐私政策有任何疑问，或希望行使您的个人信息权利，请通过上述方式与我们联系。",
      "二、本隐私政策范围\n\n本隐私政策适用于我们通过官方网站（nihplod.cn 及其子域名）、小程序、电商平台、第三方社交媒体、电子邮箱、线下实体店铺及其他线上和线下渠道，向您提供产品、服务或活动时所涉及的所有个人信息处理活动。\n\n除本隐私政策说明的相关信息收集使用活动外，本政策不适用于第三方向您提供的服务，该等服务适用第三方向您另行说明的个人信息处理规则。若某项产品、服务或活动有单独的个人信息处理规则（包括隐私政策、告知文案、现场说明、系统弹窗等），该单独规则中未涵盖的内容，以本隐私政策为准；该单独规则对本隐私政策中内容有特殊约定的，以单独规则相关内容为准。",
      "三、我们处理个人信息的法律依据\n\n根据《中华人民共和国个人信息保护法》，我们仅在具备以下一种或多种法律依据时处理您的个人信息：\n\n• 取得您的同意：例如向您发送营销信息、使用虚拟试妆功能处理您的面部特征等敏感个人信息。您可以随时撤回同意，撤回不影响撤回前已进行处理的合法性。\n• 订立或履行合同所必需：例如处理您的订单、发货、付款、会员账户管理、客户服务等。如您拒绝提供此类信息，我们可能无法向您提供相应的产品或服务。\n• 履行法定义务：例如遵守税收、财务、反欺诈、网络安全等法律法规的要求。\n• 应对突发公共卫生事件，或紧急情况下保护自然人的生命健康和财产安全。\n• 在合理的范围内处理您自行公开或其他已经合法公开的个人信息。",
    ],
  },
  collect: {
    title: "信息收集与使用",
    content: [
      "一、我们如何收集您的个人信息\n\n我们可能从以下渠道收集关于您的个人信息：\n\n• 直接向您收集：例如，当您在我们的网站或门店购物时，当您为问询或投诉而联系我们时，当您使用我们的小程序或体验虚拟试妆工具时，当您创建账户、注册会员或回复调查时。\n• 自动收集：当您访问我们的网站或使用应用程序时，我们通过 Cookies、像素标签等技术自动收集您的设备信息、日志信息、浏览记录等。\n• 从第三方获取：例如，当您使用微信等第三方平台账号登录时，我们从相关平台获取您的 Open ID、Union ID 等信息；从我们的业务合作伙伴（如广告服务提供商、数据分析服务商）处获取相关信息。\n• 通过设备权限收集：当您使用手机与我们互动时，您可以通过开启设备权限向我们提供个人信息。\n\n如果您拒绝提供使用我们的产品和/或服务所必需的个人信息，我们可能无法向您提供相应的产品或服务，无法继续处理您的订单和付款，或无法实现本隐私政策中所述的相关目的。具体后果请参见各场景下的说明。",
      "二、按场景列示的信息收集与使用\n\n我们可能会收集、使用或处理您的以下个人信息。下表中罗列出了我们在不同渠道和场景下所收集的个人信息、用途及法律依据。我们实际收集和使用的您的具体个人信息可能会因您与我们交互方式的不同而存在一定差异。",
      "（一）会员注册与账户管理\n\n目的：创建、服务和维护您的账户或会员计划会员身份。\n\n收集的个人信息：姓名/昵称、生日、性别、手机号码、电子邮箱、头像、联系地址、会员信息、第三方平台 ID（如 Union ID、Open ID）、用户名或社交媒体账号，以及您自主提供的偏好、护肤步骤、肌肤问题、肌肤类型等信息。\n\n法律依据：履行合同所必需（会员服务合同）及取得您的同意（对于营销偏好等非必要信息）。\n\n拒绝提供的后果：如您拒绝提供手机号码等必要信息，将无法注册会员账户，但您仍可以游客身份浏览商品。",
      "（二）交易处理（订单与支付）\n\n目的：处理和完成您的订单，包括发货、支付处理和售后服务。\n\n收集的个人信息：收货人姓名、手机号码、订单信息、支付信息（如支付方式、微信支付交易单号）、收货地址、开票信息（发票抬头、纳税人识别号、电子邮箱）、会员信息、买家留言及备注的定制内容。\n\n法律依据：履行合同所必需（购买合同）。\n\n拒绝提供的后果：如您拒绝提供收货地址、支付信息等必要信息，将无法完成下单和付款，但您仍可浏览商品。",
      "（三）客户服务与沟通\n\n目的：回应您的问询或投诉、帮助您下单、提供质保和处理不良反应或产品相关索赔。\n\n收集的个人信息：姓名、电子邮箱、手机号码、收货地址、订单信息、其他沟通记录及通话录音（可能包含肌肤护理方面关注的健康问题、诊断、医疗报告和记录等健康和医疗信息）。\n\n法律依据：履行合同所必需及履行法定义务（如产品安全、质量保障）。\n\n拒绝提供的后果：如您拒绝提供联系方式，我们将无法回应您的问询或处理售后服务请求。",
      "（四）营销活动与个性化推荐\n\n目的：向您发送产品资讯、促销活动、新品上市等营销信息；在社交媒体和其他网站上根据您的兴趣向您展示个性化推荐的产品和/或服务广告。\n\n收集的个人信息：地址、手机号码、电子邮箱、社交媒体账号、与您的沟通记录、收藏的产品信息、购买/试用/服务记录、产品偏好和沟通渠道偏好、社交媒体账号信息（昵称、头像、用户生成内容）、点赞记录、评论或留言内容、设备信息（如设备标识符及其他网络活动信息）。\n\n法律依据：取得您的单独同意。\n\n拒绝提供的后果：如您不同意我们处理您的信息用于营销目的，您将无法收到个性化的产品推荐和促销信息，但不影响您使用我们的基本购物服务。您可以随时通过本政策「您的权利」章节所述方式撤回同意或退订营销信息。",
      "（五）虚拟试妆与肌肤诊断\n\n目的：使用我们的虚拟试妆应用程序或肌肤诊断工具，获取产品推荐。\n\n收集的个人信息：标识符（如 UID）、照片/实时面部画像、面部几何特征、肌肤类型、眼睛颜色。\n\n重要提示：您的面部几何特征、照片等属于敏感个人信息（生物识别信息）。\n\n法律依据：取得您的单独同意。我们将在您首次使用虚拟试妆功能时，通过弹窗或其他显著方式向您告知处理的必要性及对个人的影响，并征得您的单独同意。\n\n拒绝提供的后果：如您不同意我们收集和处理您的面部特征信息，您将无法使用虚拟试妆和肌肤诊断功能，但不影响您使用我们的其他服务。",
      "（六）活动参与（调查、抽奖、推广）\n\n目的：协助您参与调查、抽奖或其他推广活动。\n\n收集的个人信息：根据活动不同，可能包括姓名、手机号码、身份证号码、收货地址、生日、电子邮箱、会员信息、昵称、头像、留言评论、工作或者专业证书，以及您自主提供的其他信息。\n\n重要提示：身份证号码属于敏感个人信息（身份识别信息）。\n\n法律依据：取得您的同意；对于身份证号码等敏感信息，需取得您的单独同意。\n\n拒绝提供的后果：如您拒绝提供活动参与所需的个人信息，您将无法参加该项活动，但不影响您使用我们的其他服务。",
      "（七）网站与应用程序运营\n\n目的：记住您的信息使您无需再次登录；了解您购物时偏爱的方式；确定您在访问我们网站或应用程序时使用的浏览器和设备；以及评估和改进我们的服务、广告、网站和应用程序。\n\n收集的个人信息：标识符（如 UID、Open ID、Union ID）、手机号码、订单信息、IP 地址、设备唯一标识符（MAC 地址或其他设备标识符）、地理位置信息、浏览和搜索历史、日志文档信息（如浏览器类型、访问的网页、访问的持续时间、点击记录等）。\n\n法律依据：履行合同所必需（提供稳定的网站服务）及合法利益（改进服务和用户体验，该利益未超过您的权益）。\n\n拒绝提供的后果：如您拒绝我们收集设备信息和日志信息，可能无法使用需要记住登录状态的功能，但不影响您浏览商品。",
      "（八）安全保障与欺诈防范\n\n目的：发现、防范和监测危害性的、欺诈性的或不合法的活动，防止丢失，发现和修复我们的网站或应用程序上的错误。\n\n收集的个人信息：设备信息、网络信息、应用信息、浏览器信息。\n\n法律依据：履行法定义务（网络安全）及合法利益（保护我们和用户免受欺诈）。",
      "（九）业务运营与改进\n\n目的：开展分析；提供质保和处理不良反应或产品相关索赔；进行产品研发；以及履行会计、审计和其他内部业务职能。\n\n收集的个人信息：诊断、医疗报告和记录等健康和医疗信息、其他您自主提供的沟通记录。\n\n重要提示：健康与医疗信息属于敏感个人信息。\n\n法律依据：履行法定义务（产品安全、财务合规）；对于健康和医疗信息，需取得您的单独同意。",
      "三、敏感个人信息处理规则\n\n请您知悉，我们收集的部分个人信息可能包含或被认定为敏感个人信息。敏感个人信息一旦泄露或非法使用，容易导致自然人的人格尊严受到侵害或人身、财产安全受到危害。\n\n我们处理的敏感个人信息包括：\n\n• 生物识别信息：面部几何特征、照片/实时面部画像（用于虚拟试妆）\n• 身份识别信息：身份证号码（用于特定活动参与）\n• 支付信息：微信支付等交易信息\n• 地理位置信息：精确位置（用于查找附近门店）\n• 健康与医疗信息：肌肤诊断结果、过敏反应记录、医疗报告等\n• 个人行踪轨迹信息（如通过持续定位收集）\n\n我们处理敏感个人信息，应当取得您的单独同意，并仅在具有特定的目的和充分的必要性，且采取严格保护措施的情形下进行。我们会在处理前向您告知处理的必要性以及对您个人权益的影响。",
    ],
  },
  device: {
    title: "设备权限管理",
    content: [
      "当您使用手机及其他设备与我们互动时，您可能需要通过开启设备权限提供给我们您的个人信息。您可以在您的设备上自主选择开启或关闭设备权限。拒绝授权不会影响您使用我们的基本服务，仅会导致对应功能无法使用。\n\n一、位置权限\n\n• 收集的个人信息：位置信息（包括精确位置和大致位置）\n• 使用目的：查找附近门店；添加附近门店专属顾问的企业微信等相关功能\n• 拒绝授权的后果：您将无法使用查找附近门店、添加门店顾问等功能，但不影响您浏览和购买商品\n• 重要提示：精确地理位置信息属于敏感个人信息\n\n二、相机权限\n\n• 收集的个人信息：图片、视频信息\n• 使用目的：扫描二维码；拍摄照片或视频（例如作为头像）；与客服沟通；发帖、评论、晒单；完成虚拟试妆或虚拟测试功能\n• 拒绝授权的后果：您将无法使用扫码、拍照上传、虚拟试妆等功能，但不影响您使用其他服务\n\n三、相册权限\n\n• 收集的个人信息：图片、视频信息\n• 使用目的：与客服沟通；上传图像（例如选择照片作为头像）；发帖、评论、晒单；完成虚拟试妆或虚拟测试功能；保存图片\n• 拒绝授权的后果：您将无法从相册选择图片上传或保存图片到相册，但不影响您使用其他服务\n\n四、麦克风权限\n\n• 收集的个人信息：语音信息\n• 使用目的：与客服沟通；发帖、评论；录制祝福语音等功能\n• 拒绝授权的后果：您将无法使用语音输入、录制语音等功能，但不影响您使用文字沟通等其他服务",
    ],
  },
  share: {
    title: "共享与披露",
    content: [
      "一、与关联公司共享\n\n我们可能基于实现本隐私政策所述的明确、合理的目的，在最小必要范围内向我们的关联公司共享您的个人信息。我们的关联公司将按照本隐私政策的规定处理您的个人信息。",
      "二、与广告公司和第三方平台共享\n\n我们与第三方广告公司（例如广告网络和社交网络）合作，这些第三方广告公司代表我们投放广告。这方面的更多信息请参见「Cookies 与广告」章节。\n\n为向您展示广告或衡量我们广告的效用，我们还与第三方平台（包括由社交网络运行的平台）合作。我们可能将您的电子邮件地址、电话号码或其他信息转换成一个唯一值（通过哈希处理或类似技术），并要求这些第三方平台将该唯一值与其平台上的一个用户或其掌握的其他数据进行匹配。这一匹配使我们能够向您和这些平台上的其他人投放广告。请注意，若该等唯一值仍可关联到您的身份，则该等信息仍属于个人信息。\n\n上述共享行为仅在获得您的单独同意后进行。如您不希望我们以此方式使用您的信息，您可以通过本隐私政策「您的权利」章节中所列明的方式要求我们停止。",
      "三、与服务提供商共享\n\n我们可能将您的个人信息共享给根据我们的指示代表我们履行服务的服务提供商。我们仅授权这些服务提供商在为代表我们履行服务或为遵守法律要求而必要的范围内使用或披露个人信息。这些服务提供商的示例包括但不限于提供以下服务的实体：处理微信支付等付款，履行订单，以及提供网站和应用程序功能、托管、分析、广告和营销服务、客户关系管理和物流服务。\n\n我们会与上述服务提供商签订数据处理协议，要求其遵守不低于本隐私政策标准的保护措施。",
      "四、第三方 SDK 清单\n\n为向您提供更好的服务或实现特定功能，我们可能在我们的网站、小程序和应用程序中嵌入或部署由第三方提供的某些软件开发工具包（SDK）。第三方 SDK 可能直接收集您的部分个人信息，我们将通过以下清单向您披露其具体情况：\n\n• 微信支付 SDK\n  – 运营主体：深圳市腾讯计算机系统有限公司\n  – 使用目的：实现订单支付功能\n  – 收集字段：订单信息、支付结果信息、设备标识信息\n  – 隐私政策链接：https://www.tenpay.com/v3/helpcenter/low/privacy.shtml\n\n• 阿里云 OSS SDK\n  – 运营主体：阿里云计算有限公司\n  – 使用目的：图片、视频等文件的云端存储与分发\n  – 收集字段：图片、视频文件、设备标识信息\n  – 隐私政策链接：https://www.aliyun.com/legal/privacy\n\n• 腾讯 Face API / 面部识别 SDK\n  – 运营主体：深圳市腾讯计算机系统有限公司\n  – 使用目的：提供虚拟试妆、肌肤诊断的面部特征分析功能\n  – 收集字段：照片、实时面部画像、面部几何特征（仅在获得您单独同意后处理）\n  – 隐私政策链接：https://privacy.qq.com/\n\n我们建议您阅读上述第三方的隐私政策以了解其详细的数据处理规则。如您不同意上述第三方 SDK 收集您的信息，您可以选择不使用相关功能。",
      "五、业务转让中的个人信息转移\n\n在我们出售或转让我们的全部或一部分业务或资产的情况下（包括在发生合并、收购、合资、重整、剥离、解散或清算的情况下），我们可能将我们掌握的关于您的个人信息转移给第三方。在转移之前，我们将向您告知接收方的名称或者姓名和联系方式，并要求接收方继续履行个人信息处理者的义务；如受保密义务限制或法律法规另有规定无法在转移前告知的，我们将在该等限制消除后及时告知。接收方变更原先的处理目的、处理方式的，我们将要求其依照法律规定重新取得您的同意。",
      "六、基于法律要求的披露\n\n在以下情况下，我们可能披露您的个人信息：\n\n• 法律或法律程序要求我们披露\n• 向执法机构或其他政府机构披露\n• 我们合理认为基于防止人身伤害或经济损失所必需，或与调查涉嫌或实际的欺诈、非法活动相关\n• 法律另行要求或允许我们披露您的个人信息\n• 获得您的单独同意（例如第三方美容服务机构）",
    ],
  },
  cookies: {
    title: "Cookies 与广告",
    content: [
      "一、我们如何使用 Cookies\n\nCookies 是网站在您连接互联网的设备上放置的小型文本文档，用于辨别您的浏览器或在您的浏览器中存储信息或设置，从而使我们在您再次访问我们网站时能够记住您并向您提供个性化的体验和广告。我们在网站上使用不同类型的 Cookies，包括绝对必要 Cookies、性能 Cookies、功能 Cookies 和定向 Cookies。\n\n• 绝对必要 Cookies：这些 Cookies 对于网站的运行是必需的，使您能够使用我们网站的基本功能，例如登录您的账户、将商品添加到购物车等。此类 Cookies 无法通过偏好设置关闭。\n• 性能 Cookies：这些 Cookies 收集有关您如何使用我们网站的信息，例如您最常访问的页面以及是否从某些页面收到错误消息。这些信息帮助我们改善网站的运行方式。\n• 功能 Cookies：这些 Cookies 允许我们记住您做出的选择（例如您的用户名、语言或所在地区），并提供增强的、更个性化的功能。\n• 定向 Cookies（包括第三方 Cookies）：这些 Cookies 记录您对我们网站的访问、您访问过的页面以及您点击过的链接。我们可能会使用这些信息来使我们的网站及其上显示的广告更符合您的兴趣。第三方广告服务商也可能通过此类 Cookies 收集您的信息，用于在其他网站或应用上向您展示广告。",
      "二、管理 Cookies 偏好\n\n您可以查看我们网站上使用的 Cookies 类型，并可以通过访问我们的网站底部的「管理 Cookies」链接（如有）编辑您的偏好，或者通过您的浏览器设置编辑您的 Cookies 偏好。\n\n当您编辑您的 Cookies 偏好时，请注意，您的设置仅适用于您在提交「退出」请求时使用的那个浏览器，因此，如果您使用多个浏览器或多个设备，您必须在每台设备的每个浏览器上都进行「退出」操作。您的「退出」是利用 Cookies 实现的，因此，您选择「退出」后，如果您又在一台设备上删除了浏览器所保存的 Cookies，您将需要再次在该台设备的浏览器上进行「退出」操作。\n\n我们的网站不会对浏览器发出的「不要跟踪」（Do Not Track）信号作出回应，原因是目前业界对于如何回应该信号尚未形成统一标准。",
      "三、定向广告与个性化推荐\n\n为了以不同方式（包括定向广告）对我们的产品和服务开展广告活动，我们可以在获得您的单独同意后，使用、共享或另行处理您的个人信息。我们与第三方广告公司（例如广告网络）合作，由这些第三方广告公司代表我们投放广告。为了投放以您为目标的广告，这些广告公司可能使用 Cookies、像素标签和类似技术来收集设备标识符、在线或网络活动信息、商业信息或推论（例如关于您在一段时间内访问的网站以及您点击的广告的信息）。\n\n您可以通过编辑您的 Cookies 偏好，选择退出基于 Cookies 实现的与您对我们网站访问偏好相关的广告。请注意，即使您选择退出，您可能仍会看到我们投放的广告，但这些广告将不再是基于您在一段时间内访问的网站以及您点击的广告的定向广告，因此，这些广告与您和您的兴趣的相关性可能会降低。\n\n您也可以通过本隐私政策「您的权利」章节中所列明的方式要求我们不要以这种方式使用您的个人信息。",
      "四、自动化决策\n\n我们可能基于您提供的信息以及通过 Cookies 和类似技术收集的信息，利用算法和机器学习技术进行自动化决策，以向您推荐您可能感兴趣的产品和服务，优化网站内容和广告投放策略。我们保证自动化决策的透明度和结果公平、公正，不会在交易价格等交易条件上对您实行不合理的差别待遇。如您认为自动化决策对您产生了重大不利影响，您有权通过「您的权利」章节所列方式要求我们予以说明，并有权拒绝我们仅通过自动化决策的方式作出决定。",
    ],
  },
  protect: {
    title: "信息保护",
    content: [
      "一、技术安全措施\n\n我们采用业界标准的安全技术来保护您的个人信息：\n\n• 数据传输加密：所有数据传输均采用 SSL/TLS 加密协议，确保传输过程中的数据安全\n• 数据存储加密：敏感个人信息（如支付信息、面部特征数据等）在存储时采用加密处理\n• 访问控制：实施严格的访问权限管理，基于最小必要原则，仅向为满足其工作需求有必要访问这些信息的员工和授权服务提供商授予访问权限\n• 安全审计：定期进行安全审计、渗透测试和漏洞扫描\n• 入侵检测：部署入侵检测和防护系统，实时监控异常行为\n• 数据备份：定期进行数据备份，确保数据的可恢复性",
      "二、组织管理措施\n\n我们建立了完善的数据保护管理体系：\n\n• 设立专门的数据保护负责人，负责监督个人信息保护工作\n• 对员工进行数据保护培训，签署保密协议\n• 建立数据分类分级制度，对不同敏感程度的数据采取不同的保护措施\n• 与第三方服务提供商签订数据保护协议，确保其遵守同等的保护标准\n• 制定数据泄露应急响应预案，确保及时有效地应对安全事件\n• 对处理敏感个人信息的情形，事前开展个人信息保护影响评估（PIA）",
      "三、数据安全事件的通知义务\n\n如发生或可能发生个人信息泄露、篡改、丢失，我们将立即采取补救措施，并按照法律法规的要求及时通知您。通知内容将包括安全事件的基本情况、影响、已采取或拟采取的补救措施、以及您可以采取的减轻危害的防护措施。如我们能够采取措施有效避免信息泄露、篡改、丢失造成危害的，我们可以选择不通知个人，但监管部门认为可能造成危害的除外。",
      "四、数据存储地点\n\n您的个人信息将存储在中华人民共和国境内的服务器上。我们不存在向境外提供或跨境传输您的个人信息的情形。",
      "五、我们保留信息的期限\n\n通常，我们在为实现本隐私政策中所述的目的而合理必要的期限内保留个人信息。在确定个人信息的保留期限时，我们会考虑诸多因素，包括：\n\n• 这些个人信息的收集目的，包括提供我们的产品和服务\n• 您的营销偏好以及您如何与我们或我们的品牌互动\n• 对这些个人信息适用的任何法定或监管要求\n• 这些个人信息是否与我们保护我们自身的权利相关（例如，适用的限制期）\n\n具体而言：\n\n• 账户信息：在您的账户有效期内保留，账户注销后将在合理期限内（通常不超过30日）删除或匿名化处理\n• 交易记录：根据适用的财务和税务法规要求保留相应期限（通常不少于5年）\n• 日志信息：通常保留不超过12个月\n• 面部特征数据（如经同意收集）：在实现虚拟试妆目的后及时删除，通常不超过提供服务所需的合理期限\n\n超出保留期限后，我们将删除或匿名化处理您的个人信息。",
    ],
  },
  rights: {
    title: "您的权利",
    content: [
      "根据《中华人民共和国个人信息保护法》及其他适用的数据保护法律，您对我们掌握的关于您的个人信息拥有相关的权利和选择。",
      "一、数据主体权利\n\n您有权：\n\n• 知情权与决定权：了解我们如何收集、使用、共享和保护您的个人信息，并决定是否同意我们处理您的个人信息\n• 查阅和复制权：查阅我们持有的关于您的个人信息，并获取该信息的副本\n• 更正和补充权：要求我们更正或补充不准确或不完整的个人信息\n• 删除权：在以下情况下要求删除您的个人信息：处理目的已实现、无法实现或不再必要；我们停止提供产品或服务或保存期限已届满；您撤回同意且无其他合法依据；我们违反法律法规或约定处理您的个人信息。但法律法规规定的保存期限未届满，或删除技术上难以实现的，我们将停止除存储和采取必要安全保护措施之外的处理\n• 限制或拒绝处理权：在特定情况下要求我们限制对您个人信息的处理，或拒绝我们对您个人信息的处理\n• 可携带权：以结构化、通用的机器可读格式获取您的个人信息副本，并在技术可行的情况下要求直接传输给其他数据控制者\n• 撤回同意权：随时撤回您此前给予的同意，撤回同意不影响撤回前已进行处理的合法性\n• 解释说明权：要求我们对您个人信息的处理规则进行解释说明\n• 注销账户权：注销您已注册的账号。注销后，我们将停止为您提供产品和服务，并依法删除或匿名化处理您的个人信息。注销行为是不可逆的，且可能影响您基于账号获取的部分服务或权益，建议您谨慎选择",
      "二、营销和广告偏好\n\n您的在线账户可能允许您编辑您的营销偏好。您还可以按照随这些通讯一同发送的退订说明，选择拒绝接收营销通讯（例如电子邮件、短消息等），您也可以通过本隐私政策「联系我们」章节中所列明的方式向我们提出退订请求。如果您退订我们的营销通讯，我们不会再将相关个人信息用于向您发送定向营销信息。\n\n• 个性化推荐：为向您推荐您可能感兴趣的产品和服务，我们会根据收集到的个人信息进行统计分析以评估预测您的兴趣偏好并进行个性化推荐。如您希望关闭个性化推荐的，可以通过本隐私政策「联系我们」章节中所列明的方式与我们取得联系或经由届时提供的操作功能进行关闭。\n\n• 移动设备和浏览器偏好：取决于您的移动设备或网络浏览器，我们可能请求您的地理位置信息或请求向您发送推送通知。您可以利用您设备上的设置功能编辑您的偏好。",
      "三、行使权利的方式\n\n您可以通过以下方式行使您的上述个人信息权利请求：\n\n• 发送电子邮件至：service@nihplod.cn\n• 通过本网站的「联系我们」页面提交请求\n• 邮寄信件至：上海市普陀区信泰中心T3栋610室，收件人：个人信息保护负责人（如需注明）\n\n我们可能会先采取合理措施验证您的身份（例如要求您提供账户相关信息或其他信息），然后再处理您的请求。我们将在15个工作日内或法律法规规定的期限内响应您的请求。对于复杂或多次请求，我们可能需要延长响应时间，届时我们会告知您。",
    ],
  },
  contact: {
    title: "联系我们",
    content: [
      "一、如何联系我们\n\n如果您对本隐私政策有任何疑问或意见，或者如果您希望行使您的权利，您可以通过以下方式联系我们：\n\n• 发送电子邮件至：service@nihplod.cn\n• 通过本网站的「联系我们」页面提交您的问题和建议\n• 邮寄信件至：上海市普陀区信泰中心T3栋610室\n\n如果我们需要或必须就涉及您的个人信息的任何事件与您联系，我们可以通过邮寄信件、电话、电子邮件或通过在我们网站或小程序上发布通知的方式与您联系。",
      "二、我们如何对待未成年人的信息\n\n我们的产品和服务是为一般受众设计的，并非针对或面向未成年人，并且我们不会在知情情况下向不满14周岁的未成年人收集信息。如果我们发现我们收集了不满14周岁的未成年人的个人信息，我们会设法尽快删除相关信息。",
      "三、更新我们的隐私政策\n\n本隐私政策可在不事先通知您的情况下定期更新，以反映我们在个人信息处理规则方面的变化。我们会在我们的网站上发布通知或向您发送通知，以向您告知我们个人信息处理规则的任何重大变化，并会在本隐私政策文首处说明本隐私政策的最近更新日期，并且，在必要时以及适用法律要求时，我们会再次征求您对更新后隐私政策的同意。",
      "四、您的个人信息处理者\n\n个人信息处理者是负责确定您的个人信息的处理目的和处理方式的实体。\n\n• 所有品牌及线上/线下渠道：旎柏（上海）商贸有限公司\n• 注册地址：上海市普陀区信泰中心T3栋610室\n\n以上个人信息处理者在不同的业务场景或渠道的法律地位，根据实际业务场景或各渠道依法公示的法律主体确定。",
    ],
  },
};

export function PrivacyContent() {
  const [activeSection, setActiveSection] = useState<string>("overview");
  const mainRef = useRef<HTMLElement>(null);

  const pageTitle = { en: "PRIVACY POLICY", zh: "隐私政策" };
  const description = "我们重视并尊重您的隐私，了解我们如何收集、使用和保护您的个人信息";
  const _lastUpdated = "2026年5月31日";

  const sectionOrder = ["overview", "device", "share", "cookies", "protect", "rights", "contact"];
  const sections = sectionOrder.map((id, index) => ({
    id,
    title: privacyData[id].title,
    content: privacyData[id].content,
    index: index + 1
  }));

  // 格式化文本：在中英文/数字之间添加空格
  const formatText = (text: string) => {
    return text
      .replace(/([\u4e00-\u9fa5])([A-Za-z0-9])/g, '$1 $2')
      .replace(/([A-Za-z0-9])([\u4e00-\u9fa5])/g, '$1 $2');
  };

  // 处理滚动高亮
  const handleScroll = () => {
    if (!mainRef.current) return;

    const containerRect = mainRef.current.getBoundingClientRect();
    const triggerPoint = containerRect.top + 120; // 触发线：距离容器顶部 120px

    let currentId = sections[0].id;

    for (const section of sections) {
      const element = document.getElementById(section.id);
      if (!element) continue;

      const rect = element.getBoundingClientRect();
      if (rect.top <= triggerPoint) {
        currentId = section.id;
      } else {
        break;
      }
    }

    if (currentId !== activeSection) {
      setActiveSection(currentId);
    }
  };

  // 平滑滚动函数
  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element && mainRef.current) {
      // 计算元素相对于容器的位置
      const top = element.offsetTop;
      mainRef.current.scrollTo({
        top: top,
        behavior: "smooth"
      });
    }
  };

  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="safe-area-content !pointer-events-none max-lg:!inset-0"
    >
      <div className="flex h-full flex-col items-center pointer-events-none drop-shadow-[4px_2px_1px_rgba(123,114,108,0.2)]">
        {/* 主内容卡片容器 */}
        <div className="w-full flex-1 overflow-hidden rounded-none lg:rounded-3xl bg-[#F0EDE1] lg:bg-[#F8F7F3] pointer-events-auto relative">
          {/* 手机端背景水印 */}
          <div className="lg:hidden absolute inset-0 pointer-events-none z-0 overflow-hidden">
            <Image
              src="/images/watermark-mobile.svg"
              alt=""
              fill
              className="object-cover opacity-75 blur-[7.5px]"
              priority
            />
          </div>

          <div className="flex h-full flex-col p-4 sm:p-6 lg:p-8">
            {/* 顶栏 / Logo 区 */}
            <header className="flex-shrink-0 text-center sm:px-4 sm:pt-2 sm:pb-6 lg:pt-4 lg:pb-8">
              {/* 手机端顶部栏 */}
              <div className="lg:hidden relative flex-shrink-0 h-[88px] w-full flex items-center justify-center pointer-events-auto">
                <button
                  onClick={() => typeof window !== "undefined" && window.history.back()}
                  className="absolute left-0 top-0 bottom-0 flex items-center justify-center px-8 py-[10px]"
                >
                  <ChevronLeft className="h-6 w-6 text-[#00263E]" />
                </button>
                <Link href="/" className="flex items-center justify-center py-[30px]">
                  <div className="relative h-[28px] w-[100px]">
                    <Image
                      src="/images/NIHPLOD-logo.svg"
                      alt="NIHPLOD Logo"
                      fill
                      className="object-contain"
                      priority
                    />
                  </div>
                </Link>
              </div>
              {/* Logo - 桌面端 */}
              <m.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="hidden lg:flex justify-center"
              >
                <div className="relative h-[32px] w-[152px] sm:h-10 sm:w-[200px]">
                  <Image
                    src="/images/NIHPLOD-logo.svg"
                    alt="公司标志"
                    fill
                    className="object-contain"
                    priority
                  />
                </div>
              </m.div>
            </header>

            {/* 分割线 - 仅桌面端 */}
            <div className="hidden lg:block mx-auto w-full max-w-7xl border-b border-brand-charcoal/10" />

            {/* 标题区 */}
            <div className="flex-shrink-0 px-4 pt-6 pb-4 text-center sm:pt-8 sm:pb-6 lg:pt-10 lg:pb-8 max-lg:px-0 max-lg:pt-[6px] max-lg:pb-4">
              <div>
                <h1 className="font-serif text-[26px] text-brand-charcoal sm:text-[32px] lg:text-brand-charcoal max-lg:text-[24px] max-lg:font-medium max-lg:tracking-[0.2em] max-lg:text-[#00263E]">
                  {pageTitle.zh}
                </h1>
                {/* 装饰短横线 - 仅移动端 */}
                <div className="lg:hidden mx-auto w-[70px] h-[1.5px] bg-[#00263E] max-lg:mt-2" />
                <p className="mx-auto max-w-lg text-sm sm:text-base leading-relaxed text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[14px] max-lg:font-light max-lg:leading-[1.8] max-lg:tracking-wide max-lg:text-[#00263E]/90 max-lg:mt-[34px]">
                  <span className="hidden lg:inline">{description}</span>
                  <span className="lg:hidden">我们重视并尊重您的隐私，<br />了解我们如何收集、使用和保护您的个人信息</span>
                </p>
              </div>
            </div>

            {/* 布局：目录导航 + 条款内容 */}
            <div className="flex flex-1 overflow-hidden relative mx-auto w-full max-w-7xl">

              {/* 左侧导航 - 更加精致的排版 */}
              <aside className="hidden w-48 flex-shrink-0 border-r border-brand-charcoal/5 lg:flex flex-col items-center overflow-y-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                <nav className="space-y-6 w-full px-6 pt-4">
                  <div className="flex items-center gap-3 px-2 opacity-80">
                    <p className="text-sm font-bold text-brand-charcoal">
                      目录
                    </p>
                  </div>

                  <div className="flex flex-col space-y-1">
                    {sections.map((section) => (
                      <button
                        key={section.id}
                        onClick={() => scrollToSection(section.id)}
                        className={cn(
                          "group relative flex w-full items-center py-3 px-2 text-left transition-all duration-300 rounded-lg hover:bg-brand-charcoal/5",
                          activeSection === section.id
                            ? "text-brand-charcoal"
                            : "text-brand-charcoal/60"
                        )}
                      >
                        <span className={cn(
                          "text-sm tabular-nums transition-all duration-300 mr-2 font-medium",
                          activeSection === section.id ? "opacity-100 font-semibold" : "opacity-60 group-hover:opacity-100"
                        )}>
                          0{section.index}
                        </span>
                        <span className={cn(
                          "text-sm font-medium transition-all duration-300",
                          activeSection === section.id ? "font-bold translate-x-1" : "group-hover:translate-x-1"
                        )}>
                          {section.title}
                        </span>

                        {/* 激活状态指示点 - 调整位置 */}
                        {activeSection === section.id && (
                          <m.div
                            layoutId="active-dot"
                            className="absolute right-2 h-1 w-1 rounded-full bg-brand-gold"
                            transition={{ type: "spring", stiffness: 300, damping: 30 }}
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </nav>
              </aside>

              {/* 右侧内容区域 - 极简主义排版 */}
              <main
                ref={mainRef}
                onScroll={handleScroll}
                className="flex-1 overflow-y-auto scroll-smooth [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
              >
                <div className="max-w-6xl px-6 lg:px-12">
                  <div className="space-y-24">
                    {sections.map((section) => (
                      <section
                        key={section.id}
                        id={section.id}
                        className="scroll-mt-24 group relative"
                      >
                        {/* 章节内容 */}
                        <div className="space-y-4 pl-2 lg:pl-6">
                          {(!section.content || section.content.length === 0) ? (
                            <p className="text-sm text-gray-500 italic">内容更新中...</p>
                          ) : (
                            section.content.map((paragraph, pIdx) => {
                              const lines = paragraph.split(/\r?\n/);
                              return (
                                <div key={pIdx} className="space-y-2">
                                  {lines.map((line, lIdx) => {
                                    const trimmed = line.trim();
                                    if (!trimmed) return <div key={lIdx} className="h-2" />;

                                    // 条款内标题 (一、二、...)
                                    if (/^[一二三四五六七八九十0-9]+[、.]/.test(trimmed)) {
                                      return (
                                        <h3 key={lIdx} className="pt-4 font-serif text-lg font-bold text-gray-900">
                                          {formatText(trimmed)}
                                        </h3>
                                      );
                                    }

                                    // 列表项 (•)
                                    if (trimmed.startsWith('•')) {
                                      return (
                                        <div key={lIdx} className="flex gap-3 text-sm leading-relaxed text-gray-700">
                                          <span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-brand-gold/60" />
                                          <p className="flex-1 opacity-90">{formatText(trimmed.substring(1).trim())}</p>
                                        </div>
                                      );
                                    }

                                    // 普通段落
                                    return (
                                      <p key={lIdx} className="text-sm leading-7 text-gray-700 opacity-90 text-justify">
                                        {formatText(trimmed)}
                                      </p>
                                    );
                                  })}
                                </div>
                              );
                            })
                          )}
                        </div>
                      </section>
                    ))}
                  </div>


                </div>
              </main>
            </div>

            {/* 底部版权信息 - 固定在卡片底部 */}
            <div className="mt-auto pt-4 pb-4 sm:pt-6 lg:pt-8 text-center border-t border-brand-charcoal/5 mx-6 lg:mx-12 max-lg:border-0 max-lg:pt-4">
              <p className="text-[10px] sm:text-[12px] font-light tracking-widest text-brand-charcoal/60 lg:text-brand-charcoal/60 max-lg:text-[#7B726C]/30 max-lg:tracking-[0.12em] max-lg:font-medium">
                &copy; {new Date().getFullYear()} NIHPLOD. All Rights Reserved.
              </p>
            </div>
          </div>
        </div>

        {/* 返回上页按钮 - 仅桌面端 */}
        <button
          onClick={() => typeof window !== "undefined" && window.history.back()}
          className="hidden lg:flex group items-center justify-center gap-2 rounded-b-2xl bg-[#F8F7F3] px-10 py-2.5 lg:px-14 lg:py-3 pointer-events-auto"
        >
          <ArrowLeft className="h-5 w-5 text-brand-gold transition-all duration-200 group-hover:scale-110 group-hover:text-brand-gold/80 lg:h-6 lg:w-6" />
          <span className="text-sm font-medium text-brand-charcoal transition-colors duration-200 group-hover:text-brand-charcoal/70 lg:text-base">返回上页</span>
        </button>
      </div>
    </m.div>
  );
}
