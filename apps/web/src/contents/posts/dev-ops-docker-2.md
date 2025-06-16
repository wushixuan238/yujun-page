---
title: "云服务器环境安装"  
category: "DevOps"  
publishedAt: "2025-06-03"  
summary: "DevOps"  
tags:  
  - DevOps
banner: /images/banner/posts/dev-ops/dev-ops-docker-2.png
alt: "图片替代文本"  
mathjax: false
---

# 云服务器环境安装

> 很多开发者做的项目只停留在本地，从未上线部署，导致项目经验不完整，也让本地开发环境变得混乱。

不知道大家是不是也经历过这样的场景：

* 为了跑一个项目，在自己的 Windows 电脑上装了 MySQL、又装了 Redis，电脑越来越卡。
* 跟着教程敲了半天命令，结果一个字母打错，环境就崩了，心态也崩了。
* 好不容易做完一个项目，想给面试官展示，却发现它只能在你的电脑上运行，一挪窝就“水土不服”。

今天，我们就来彻底解决这个问题。利用一个脚本即可，轻松地把一台空白的云服务器，变成一个功能强大的、随用随取的开发环境。

假设现在我们已经有了自己的云服务器，有了服务器，我们就要开始装软件了。

之前我们安装环境，可能的步骤是：打开一个长长的教程文档。然后小心翼翼地一条条复制、粘贴命令。祈祷网络没问题，祈祷自己别手抖打错字。一个环节出错，就得花半天时间去网上找答案。

这种方式不仅慢，而且极易出错，更要命的是，下次你要再搭一套环境，还得把这痛苦的过程再经历一遍。

相较于之前的教程手动一个一个敲命令，在这里更推荐脚本安装环境，因为我们的任务是软件开发，而不是配置环境，不要把时间浪费在这上面。

> 执行一个命令，然后你就可以去泡杯咖啡了。回来时，一切都已就绪。

你需要做的，仅仅是看着菜单，输入你想要的Y / N，然后回车。脚本就会自动帮你把这些软件装好，并配置妥当。

## 安装 Docker

```sh
#!/bin/bash

# ================================================================= #
#       通用 Docker & Docker Compose 一键安装脚本 (智能适配) 🚀     #
# ================================================================= #
#                                                                   #
# 作者：Yujun (基于 xiaofuge 的优秀脚本进行修改和增强)              #
# 版本：3.0-Universal                                               #
# 日期：2024-06-13                                                  #
# 用途：自动检测 CentOS/RHEL 或 Ubuntu/Debian 系统并安装 Docker。   #
#                                                                   #
# ================================================================= #

# --- 设置颜色输出，让提示更醒目 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# --- 定义带颜色的信息输出函数 ---
info() {
    echo -e "${GREEN}[✅ INFO]${NC} $1"
}

warning() {
    echo -e "${YELLOW}[⚠️ WARNING]${NC} $1"
}

error() {
    echo -e "${RED}[❌ ERROR]${NC} $1"
    exit 1
}

step() {
    echo -e "\n${BLUE}Step ==> $1${NC}"
}

# --- 权限检查：确保以 root 用户运行 ---
if [ "$(id -u)" -ne 0 ]; then
    warning "需要 root 权限。别担心，我将尝试使用 sudo 帮您搞定... 👮"
    exec sudo "$0" "$@"
    exit $?
fi

# --- 操作系统检测 ---
OS_TYPE=""
if grep -q -i "centos\|red hat" /etc/os-release; then
    OS_TYPE="centos"
elif grep -q -i "ubuntu\|debian" /etc/os-release; then
    OS_TYPE="ubuntu"
else
    error "无法识别的操作系统。此脚本仅支持 CentOS/RHEL 和 Ubuntu/Debian。"
fi

# --- 欢迎与系统检查 ---
echo -e "${BLUE}======================================================${NC}"
echo -e "${GREEN} 欢迎使用 Docker 通用一键部署脚本 ✨ ${NC}"
echo -e "${BLUE}======================================================${NC}"
info "即将开始为您配置一台强大的 Docker 主机！"

step "1. 系统环境检查"
info "检测到您的操作系统为: ${YELLOW}${OS_TYPE}${NC}"
echo "  - 内核版本: $(uname -r)"
echo "  - 操作系统: $(cat /etc/os-release | grep PRETTY_NAME | cut -d '"' -f 2)"

# --- 将特定于系统的操作封装到函数中 ---

uninstall_docker() {
    info "好的，开始清理旧的 Docker 环境... 🗑️"
    systemctl stop docker &> /dev/null
    if [ "$OS_TYPE" == "centos" ]; then
        yum remove -y docker-ce docker-ce-cli containerd.io docker docker-client docker-client-latest docker-common docker-latest docker-latest-logrotate docker-logrotate docker-engine &> /dev/null
    elif [ "$OS_TYPE" == "ubuntu" ]; then
        apt-get remove -y docker-ce docker-ce-cli containerd.io docker.io docker-engine docker-buildx-plugin docker-compose-plugin &> /dev/null
        rm -rf /var/lib/containerd
    fi
    rm -rf /var/lib/docker
    info "旧版本 Docker 已彻底卸载！"
}

install_docker_dependencies_and_repo() {
    if [ "$OS_TYPE" == "centos" ]; then
        step "3. 更新系统软件包 & 安装依赖"
        yum update -y || error "系统更新失败。"
        yum install -y yum-utils device-mapper-persistent-data lvm2 || error "依赖包安装失败。"
        step "4. 添加 Docker 仓库 (阿里源)"
        yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo || error "添加 Docker 仓库失败。"
    elif [ "$OS_TYPE" == "ubuntu" ]; then
        step "3. 更新系统软件包 & 安装依赖"
        apt-get update -y || error "系统更新失败。"
        apt-get install -y ca-certificates curl gnupg lsb-release || error "依赖包安装失败。"
        step "4. 添加 Docker 官方 GPG 密钥和仓库"
        install -m 0755 -d /etc/apt/keyrings
        curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
        chmod a+r /etc/apt/keyrings/docker.gpg
        echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | tee /etc/apt/sources.list.d/docker.list > /dev/null
        apt-get update -y || error "更新 Docker 仓库信息失败。"
    fi
}

install_docker_engine() {
    step "5. 安装 Docker Engine"
    info "核心步骤：正在安装 Docker Engine... 🐳"
    if [ "$OS_TYPE" == "centos" ]; then
        # 锁定一个已知稳定的版本
        yum install -y docker-ce-25.0.5 docker-ce-cli-25.0.5 containerd.io || error "Docker 安装失败！"
    elif [ "$OS_TYPE" == "ubuntu" ]; then
        # 安装最新稳定版
        apt-get install -y docker-ce docker-ce-cli containerd.io || error "Docker 安装失败！"
    fi
}

# --- 主执行流程 ---

step "2. 检查现有的 Docker 安装"
if command -v docker &> /dev/null; then
    INSTALLED_DOCKER_VERSION=$(docker --version | cut -d ' ' -f3 | cut -d ',' -f1)
    warning "🤔 检测到系统已安装 Docker，版本为: $INSTALLED_DOCKER_VERSION"
    
    read -p "是否需要卸载旧版本并重新安装？(y/n): " UNINSTALL_DOCKER
    
    if [[ "$UNINSTALL_DOCKER" =~ ^[Yy]$ ]]; then
        uninstall_docker
    else
        info "好的，您选择保留现有 Docker。脚本退出。👋"
        exit 0
    fi
fi

# 调用特定于系统的安装函数
install_docker_dependencies_and_repo
install_docker_engine

# --- 通用安装步骤 ---

step "6. 安装 Docker Compose"
info "正在安装 Docker Compose v2.24.1，让多容器管理更简单... 🎼"
curl -L https://gitee.com/fustack/docker-compose/releases/download/v2.24.1/docker-compose-linux-x86_64 -o /usr/local/bin/docker-compose || error "Docker Compose 下载失败，请检查网络。"
chmod +x /usr/local/bin/docker-compose || error "无法设置 Docker Compose 的可执行权限。"

step "7. 启动并设置 Docker 开机自启"
info "正在启动 Docker 服务... ⚡️"
systemctl start docker || error "Docker 服务启动失败。"
info "设置 Docker 为开机自启动，省去后顾之忧... 🔄"
systemctl enable docker || error "设置 Docker 开机自启失败。"

step "8. 配置国内镜像加速器"
info "为 Docker Hub 配置国内镜像，拉取镜像快如闪电... 🪞"
mkdir -p /etc/docker
cat > /etc/docker/daemon.json << EOF
{
  "registry-mirrors": [
    "https://docker.1ms.run",
    "https://docker.1panel.live",
    "https://docker.ketches.cn"
  ]
}
EOF
info "镜像加速配置完毕，正在重启 Docker 使其生效..."
systemctl restart docker || error "应用镜像加速配置后 Docker 重启失败。"

# --- 最终验证 ---
step "9. 最终验证"
info "正在检查安装结果..."
DOCKER_VERSION=$(docker --version)
DOCKER_COMPOSE_VERSION=$(docker-compose --version)

# --- 总结 ---
echo -e "\n${BLUE}===================================================================${NC}"
echo -e "${GREEN}          🎉🎉🎉 恭喜！Docker 环境已为您准备就绪！ 🎉🎉🎉          ${NC}"
echo -e "${BLUE}===================================================================${NC}"
echo -e "  > ${GREEN}Docker 版本:${NC}      $DOCKER_VERSION"
echo -e "  > ${GREEN}Docker Compose 版本:${NC} $DOCKER_COMPOSE_VERSION"
echo ""
info "镜像加速已配置为："
echo -e "  - ${YELLOW}https://docker.1ms.run${NC}"
echo -e "  - ${YELLOW}https://docker.1panel.live${NC}"
echo -e "  - ${YELLOW}https://docker.ketches.cn${NC}"
echo ""
warning "💡 温馨提示：如果发现镜像无法拉取，可以访问 https://status.1panel.top/status/docker 查看最新可用镜像并手动修改 /etc/docker/daemon.json 文件。"
echo -e "${BLUE}===================================================================${NC}\n"
```

请把这部分脚本内容写到：`install_docker.sh` 文件中，并上传到云服务器上。

## 安装 Portainer

```sh
#!/bin/bash

# ================================================================= #
#          独立的 Portainer 安装脚本 ⛵          #
# ================================================================= #
#                                                                   #
# 作者：Yujun                                                       #
# 版本：1.0                                                         #
# 用途：在任何已安装 Docker 的系统上，一键安装或重装 Portainer。    #
#                                                                   #
# ================================================================= #

# --- 设置颜色输出 ---
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# --- 定义信息输出函数 ---
info() { echo -e "${GREEN}[✅ INFO]${NC} $1"; }
warning() { echo -e "${YELLOW}[⚠️ WARNING]${NC} $1"; }
error() { echo -e "${RED}[❌ ERROR]${NC} $1"; exit 1; }
header() { echo -e "\n${BLUE}===================== $1 =====================${NC}"; }

header "Portainer 安装向导"

# 1. 检查 Docker 是否已安装并运行 (关键前提)
if ! command -v docker &> /dev/null; then
    error "Docker 未安装！请先运行 'install_docker_universal.sh' 安装 Docker。"
fi
if ! docker info &> /dev/null; then
    error "Docker 服务未运行！请使用 'sudo systemctl start docker' 启动它。"
fi
info "Docker 环境检测通过。"

# 2. 检查 Portainer 容器是否已存在
if [ $(docker ps -a -f "name=portainer" --format '{{.Names}}') ]; then
    warning "检测到名为 'portainer' 的容器已存在。"
    read -p "是否需要删除现有容器并重新安装？(y/n) [默认: n]: " REINSTALL
    REINSTALL=${REINSTALL:-n}
    if [[ "$REINSTALL" =~ ^[Yy]$ ]]; then
        info "正在删除旧的 Portainer 容器..."
        docker rm -f portainer || error "删除旧容器失败！"
        info "旧容器已删除。"
    else
        info "您选择保留现有容器。脚本退出。👋"
        exit 0
    fi
fi

# 3. 开始安装 Portainer
info "开始安装最新社区版的 Portainer (portainer-ce)..."
docker run -d \
  --name portainer \
  --restart=always \
  -p 9000:9000 \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v portainer_data:/data \
  portainer/portainer-ce:latest

# 4. 验证安装结果
if [ $? -eq 0 ]; then
    # 尝试自动获取公网IP
    PUBLIC_IP=$(curl -s http://ipinfo.io/ip || curl -s http://icanhazip.com || echo "<您的服务器公网IP>")
    
    info "Portainer 安装成功！"
    header "🎉 Portainer 访问信息 🎉"
    echo -e "${GREEN}访问地址:${NC} ${YELLOW}http://${PUBLIC_IP}:9000${NC}"
    echo ""
    echo "下一步操作指引："
    echo "1. 在浏览器中打开上面的地址。"
    echo "2. 首次访问，需要设置一个管理员账号 (admin) 和密码。"
    echo "3. 登录后，选择 'Local' 环境进行连接，开始您的可视化 Docker之旅！"
    warning "重要提示：请务必在您的云服务商防火墙/安全组中，开放 9000 端口！"
    echo -e "${BLUE}=======================================================${NC}"
else
    error "Portainer 安装失败！请检查 Docker 状态和上面的错误日志。"
fi
```

请把这部分脚本内容写到：`install_portainer.sh` 文件中，并上传到云服务器上。

---

通过这套脚本，我们把原来可能需要耗费半天甚至一天的环境搭建工作，压缩成了几分钟的傻瓜式操作。
现在，我们拥有了一个专业、稳定、可重复的云端开发环境。从此，你可以把宝贵的精力真正地投入到写代码、做项目、搞创新上，而不是在环境配置的泥潭里反复挣扎。

